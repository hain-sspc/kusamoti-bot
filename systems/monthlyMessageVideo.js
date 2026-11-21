const { createCanvas, loadImage } = require("canvas");
const { spawn } = require("child_process");

const DAY_MS = 24 * 60 * 60 * 1000;
const ROLLING_WINDOW_MS = 30 * DAY_MS;
const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 12;
const RANK_LIMIT = 10;
const RANK_TRANSITION_START = 0.4;
const DROPOUT_LABEL_START = 0;
const DROPOUT_LABEL_END = 0.8;

function parseLogTime(timeKey) {
    const timestamp = new Date(
        `${String(timeKey).slice(0, 16)}:00Z`
    ).getTime();

    return Number.isFinite(timestamp) ? timestamp : null;
}

function rankTotals(totals) {
    return [...totals.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, RANK_LIMIT)
        .map(([userId, count], index) => ({
            userId,
            count,
            rank: index + 1
        }));
}

function createMonthlyRankingHistory(logs) {
    const entries = Object.entries(logs || {})
        .map(([timeKey, record]) => ({
            timestamp: parseLogTime(timeKey),
            users: record?.users || {}
        }))
        .filter(entry => entry.timestamp !== null)
        .sort((a, b) => a.timestamp - b.timestamp);

    if (entries.length === 0) return [];

    const totals = new Map();
    const history = [];
    const firstTimestamp = entries[0].timestamp;
    const lastTimestamp = entries[entries.length - 1].timestamp;
    let entryIndex = 0;
    let expireIndex = 0;
    let checkpoint = firstTimestamp;

    while (checkpoint < lastTimestamp) {
        while (
            entryIndex < entries.length &&
            entries[entryIndex].timestamp <= checkpoint
        ) {
            addEntryToTotals(totals, entries[entryIndex]);
            entryIndex++;
        }

        while (
            expireIndex < entryIndex &&
            entries[expireIndex].timestamp <= checkpoint - ROLLING_WINDOW_MS
        ) {
            addEntryToTotals(totals, entries[expireIndex], -1);
            expireIndex++;
        }

        history.push({
            timestamp: checkpoint,
            ranking: rankTotals(totals),
            totalCount: [...totals.values()].reduce((sum, count) => sum + count, 0)
        });
        checkpoint = Math.min(checkpoint + DAY_MS, lastTimestamp);
    }

    while (entryIndex < entries.length) {
        addEntryToTotals(totals, entries[entryIndex]);
        entryIndex++;
    }
    while (
        expireIndex < entryIndex &&
        entries[expireIndex].timestamp <= lastTimestamp - ROLLING_WINDOW_MS
    ) {
        addEntryToTotals(totals, entries[expireIndex], -1);
        expireIndex++;
    }

    history.push({
        timestamp: lastTimestamp,
        ranking: rankTotals(totals),
        totalCount: [...totals.values()].reduce((sum, count) => sum + count, 0)
    });

    if (history.length === 1) {
        history.unshift({
            timestamp: firstTimestamp - 1,
            ranking: [],
            totalCount: 0
        });
    }

    const firstPlaceUsers = new Set();
    for (const snapshot of history) {
        const firstPlaceUser = snapshot.ranking.find(user => user.rank === 1);
        if (firstPlaceUser) firstPlaceUsers.add(firstPlaceUser.userId);
        for (const user of snapshot.ranking) {
            user.hasBeenFirst = firstPlaceUsers.has(user.userId);
        }
    }

    return history;
}

function addEntryToTotals(totals, entry, direction = 1) {
    for (const [userId, rawCount] of Object.entries(entry.users)) {
        const count = Number(rawCount);
        if (!Number.isFinite(count) || count <= 0) continue;
        const nextCount = (totals.get(userId) || 0) + count * direction;
        if (nextCount <= 0) {
            totals.delete(userId);
        } else {
            totals.set(userId, nextCount);
        }
    }
}

function getStableUserColor(userId) {
    let hash = 0;
    for (const character of userId) {
        hash = (hash * 31 + character.charCodeAt(0)) | 0;
    }
    const hue = (Math.abs(hash) * 137.508) % 360;
    return `hsl(${hue}, 72%, 58%)`;
}

async function fetchDisplayNames(history, guild, client) {
    const userIds = [...new Set(
        history.flatMap(snapshot =>
            snapshot.ranking.map(user => user.userId)
        )
    )];
    const profiles = new Map();
    let nextIndex = 0;

    async function fetchNext() {
        while (nextIndex < userIds.length) {
            const userId = userIds[nextIndex++];
            const member = guild?.members?.cache?.get(userId);
            try {
                const user = member?.user || await client.users.fetch(userId);
                const avatarUrl = user.displayAvatarURL({
                    extension: "png",
                    size: 128
                });
                try {
                    profiles.set(userId, {
                        name: member?.displayName ||
                            user.globalName ||
                            user.username,
                        avatar: await loadImage(avatarUrl)
                    });
                } catch (error) {
                    console.warn(
                        `ランキング動画のアバター取得失敗: ${userId}`,
                        error.message
                    );
                    profiles.set(userId, {
                        name: member?.displayName ||
                            user.globalName ||
                            user.username,
                        avatar: null
                    });
                }
            } catch (error) {
                console.warn(
                    `ランキング動画のユーザー情報取得失敗: ${userId}`,
                    error.message
                );
                profiles.set(userId, {
                    name: member?.displayName || userId,
                    avatar: null
                });
            }
        }
    }

    await Promise.all(
        Array.from({ length: Math.min(5, userIds.length) }, fetchNext)
    );
    return profiles;
}

function interpolateRanking(previous, current, progress) {
    const transitionProgress = Math.max(
        0,
        Math.min(1, (progress - RANK_TRANSITION_START) / 0.2)
    );
    const easedRankProgress = transitionProgress * transitionProgress *
        (3 - 2 * transitionProgress);
    const previousUsers = new Map(
        previous.ranking.map(user => [user.userId, user])
    );
    const currentUsers = new Map(
        current.ranking.map(user => [user.userId, user])
    );
    const userIds = new Set([
        ...previousUsers.keys(),
        ...currentUsers.keys()
    ]);

    return [...userIds]
        .map(userId => {
            const from = previousUsers.get(userId);
            const to = currentUsers.get(userId);
            const previousCount = from?.count || 0;
            const currentCount = to?.count || 0;
            return {
                userId,
                rank: (from?.rank || RANK_LIMIT + 1) +
                    ((to?.rank || RANK_LIMIT + 1) -
                        (from?.rank || RANK_LIMIT + 1)) * easedRankProgress,
                count: previousCount +
                    (currentCount - previousCount) * progress,
                countTrend: currentCount - previousCount,
                hasBeenFirst: Boolean(
                    from?.hasBeenFirst || to?.hasBeenFirst
                ),
                opacity: from && to
                    ? 1
                    : from
                        ? 1 - progress
                        : progress
            };
        })
        .filter(user => user.count > 0 && user.rank <= RANK_LIMIT + 1)
        .sort((a, b) => a.rank - b.rank || a.userId.localeCompare(b.userId));
}

function getFrameState(history, frame, totalFrames = getTotalFrames(history)) {
    const progress = frame / (totalFrames - 1);
    const firstTimestamp = history[0].timestamp;
    const lastTimestamp = history[history.length - 1].timestamp;
    const timestamp = firstTimestamp +
        (lastTimestamp - firstTimestamp) * progress;

    let nextIndex = history.findIndex(
        snapshot => snapshot.timestamp >= timestamp
    );
    if (nextIndex <= 0) nextIndex = 1;
    if (nextIndex >= history.length) nextIndex = history.length - 1;

    const previous = history[nextIndex - 1];
    const current = history[nextIndex];
    const interval = current.timestamp - previous.timestamp;
    const dayProgress = interval <= 0
        ? 1
        : (timestamp - previous.timestamp) / interval;

    return {
        timestamp,
        elapsed: progress,
        totalCount: previous.totalCount +
            (current.totalCount - previous.totalCount) * dayProgress,
        totalTrend: current.totalCount - previous.totalCount,
        droppedOutUserIds: dayProgress >= DROPOUT_LABEL_START &&
            dayProgress <= DROPOUT_LABEL_END
            ? previous.ranking
                .filter(user =>
                    user.hasBeenFirst &&
                    !current.ranking.some(
                        nextUser => nextUser.userId === user.userId
                    )
                )
                .map(user => user.userId)
            : [],
        ranking: interpolateRanking(previous, current, dayProgress)
    };
}

function getTotalFrames(history) {
    const duration = history.at(-1).timestamp - history[0].timestamp;
    return Math.max(2, Math.ceil((duration / DAY_MS) * FPS * 1.82));
}

function drawFrame(ctx, state, profiles) {
    const { timestamp, elapsed, totalCount, totalTrend, ranking } = state;

    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 42px sans-serif";
    ctx.fillText("直近30日間 メッセージランキング", 56, 64);
    ctx.fillStyle = "#aab4c3";
    ctx.font = "22px sans-serif";
    ctx.fillText(
        new Date(timestamp).toLocaleDateString("ja-JP", {
            timeZone: "Asia/Tokyo",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }),
        58,
        105
    );
    ctx.textAlign = "right";
    ctx.fillText(
        `${(elapsed * 100).toFixed(0)}%`,
        WIDTH - 58,
        105
    );
    ctx.textAlign = "left";
    ctx.fillStyle = totalTrend > 0
        ? "#3b82f6"
        : totalTrend < 0
            ? "#ef4444"
            : "#ffffff";
    ctx.font = "bold 22px sans-serif";
    const totalCountLabel =
        `総メッセージ数: ${Math.round(totalCount).toLocaleString("ja-JP")}`;
    ctx.fillText(totalCountLabel, 58, 145);

    for (const user of ranking) {
        const y = 172 + (user.rank - 1) * 45;
        const barWidth = totalCount > 0
            ? (user.count / totalCount) * 650
            : 0;

        ctx.globalAlpha = user.opacity;
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 25px sans-serif";
        ctx.fillText(`${Math.max(1, Math.round(user.rank))}位`, 60, y + 22);
        const avatarX = 105;
        const avatarY = y - 1;
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX + 18, avatarY + 18, 18, 0, Math.PI * 2);
        ctx.clip();
        const avatar = profiles.get(user.userId)?.avatar;
        if (avatar) {
            ctx.drawImage(avatar, avatarX, avatarY, 36, 36);
        } else {
            ctx.fillStyle = getStableUserColor(user.userId);
            ctx.fillRect(avatarX, avatarY, 36, 36);
        }
        ctx.restore();
        ctx.font = "22px sans-serif";
        ctx.fillStyle = user.hasBeenFirst ? "#f97316" : "#ffffff";
        ctx.fillText(
            profiles.get(user.userId)?.name || user.userId,
            152,
            y + 22,
            318
        );

        ctx.fillStyle = "#273449";
        ctx.fillRect(490, y, 650, 32);
        ctx.fillStyle = getStableUserColor(user.userId);
        ctx.fillRect(490, y, barWidth, 32);
        ctx.fillStyle = user.countTrend > 0
            ? "#3b82f6"
            : user.countTrend < 0
                ? "#ef4444"
                : "#ffffff";
        ctx.font = "bold 20px sans-serif";
        ctx.fillText(
            Math.round(user.count).toLocaleString("ja-JP"),
            1155,
            y + 23
        );
        ctx.globalAlpha = 1;
    }

    ctx.fillStyle = "#7f8a9b";
    ctx.font = "16px sans-serif";
    ctx.fillText("各時点から過去30日間のメッセージ数", 60, HEIGHT - 28);

    if (state.droppedOutUserIds.length > 0) {
        const droppedNames = state.droppedOutUserIds
            .map(userId => profiles.get(userId)?.name || userId)
            .map(name => `${name}脱落`)
            .join(" / ");
        ctx.fillStyle = "#f97316";
        ctx.font = "bold 22px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(
            droppedNames,
            WIDTH / 2,
            105,
            700
        );
        ctx.textAlign = "left";
    }
}

async function createMonthlyRankingVideo({
    logs,
    guild,
    client,
    output,
    onProgress
}) {
    const history = createMonthlyRankingHistory(logs);
    if (history.length === 0 || history.at(-1).ranking.length === 0) {
        throw new Error("メッセージデータがありません");
    }
    if (!output) {
        throw new Error("動画の出力先が指定されていません");
    }

    const totalFrames = getTotalFrames(history);
    const profiles = await fetchDisplayNames(history, guild, client);
    const ffmpeg = spawn("ffmpeg", [
        "-y",
        "-f", "image2pipe",
        "-framerate", String(FPS),
        "-i", "-",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "28",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        output
    ]);
    let processError = null;
    let inputError = null;
    let stderr = "";

    ffmpeg.on("error", error => {
        processError = error;
    });
    ffmpeg.stdin.on("error", error => {
        inputError = error;
    });
    ffmpeg.stderr.on("data", chunk => {
        stderr = (stderr + chunk.toString()).slice(-4000);
    });

    const closed = new Promise(resolve => {
        ffmpeg.once("close", (code, signal) => resolve({ code, signal }));
    });
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext("2d");

    try {
        for (let frame = 0; frame < totalFrames; frame++) {
            drawFrame(
                ctx,
                getFrameState(history, frame, totalFrames),
                profiles
            );
            await new Promise((resolve, reject) => {
                ffmpeg.stdin.write(canvas.toBuffer("image/jpeg"), error => {
                    if (error || inputError) {
                        reject(error || inputError);
                    } else {
                        resolve();
                    }
                });
            });

            if (onProgress) {
                await onProgress(frame + 1, totalFrames);
            }
        }
        ffmpeg.stdin.end();

        const { code, signal } = await closed;
        if (processError) throw processError;
        if (code !== 0) {
            throw new Error(
                `ffmpeg が終了コード ${code} で終了しました` +
                (signal ? ` (${signal})` : "") +
                (stderr ? `: ${stderr.trim()}` : "")
            );
        }
    } catch (error) {
        ffmpeg.stdin.destroy();
        ffmpeg.kill();
        await closed;
        throw error;
    }

    return output;
}

module.exports = {
    createMonthlyRankingHistory,
    createMonthlyRankingVideo,
    getFrameState,
    getStableUserColor,
    getTotalFrames
};
