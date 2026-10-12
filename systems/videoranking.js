const path = require("path");

const { Ranking } = require("./ranking");
const { createVideo } = require("./video");
const{ loadGuildData } = require("../messageLogger");


const OUTPUT_PATH = path.join(__dirname, "../data/video.mp4");
const DAY_MS = 24 * 60 * 60 * 1000;
const VIDEO_SECONDS_PER_DAY = 30;
const HISTORY_INTERPOLATION_STEP_MS = 60 * 60 * 1000;

function interpolateRankingSnapshot(previous, current, progress) {
    const userIds = new Set([
        ...(previous?.ranking || []).map(user => user.userId),
        ...(current?.ranking || []).map(user => user.userId)
    ]);

    const ranking = [...userIds].map(userId => {
        const from = (previous?.ranking || []).find(user => user.userId === userId);
        const to = (current?.ranking || []).find(user => user.userId === userId);
        const short = (from?.short || 0) + ((to?.short || 0) - (from?.short || 0)) * progress;
        const long = (from?.long || 0) + ((to?.long || 0) - (from?.long || 0)) * progress;
        const shortRatio = (from?.shortRatio || 0) + ((to?.shortRatio || 0) - (from?.shortRatio || 0)) * progress;
        const longRatio = (from?.longRatio || 0) + ((to?.longRatio || 0) - (from?.longRatio || 0)) * progress;
        const rank = (from?.rank || Number.MAX_SAFE_INTEGER) + ((to?.rank || Number.MAX_SAFE_INTEGER) - (from?.rank || Number.MAX_SAFE_INTEGER)) * progress;

        return {
            userId,
            short,
            long,
            shortRatio,
            longRatio,
            rank,
            type: shortRatio >= longRatio ? "短期" : "長期"
        };
    });

    const sortedRanking = ranking
        .sort((a, b) => {
            const ratioDifference = Math.max(b.shortRatio, b.longRatio) - Math.max(a.shortRatio, a.longRatio);
            if (ratioDifference !== 0) return ratioDifference;
            const countDifference = (b.short + b.long) - (a.short + a.long);
            return countDifference || a.userId.localeCompare(b.userId);
        })
        .map((user, index) => ({
            ...user,
            rank: index + 1
        }));

    return {
        timestamp: previous.timestamp + (current.timestamp - previous.timestamp) * progress,
        ranking: sortedRanking,
        shortTopUser: progress < 0.5 ? previous.shortTopUser : current.shortTopUser,
        longTopUser: progress < 0.5 ? previous.longTopUser : current.longTopUser,
        topUserId: progress < 0.5 ? previous.topUserId : current.topUserId,
        longTop3Ids: progress < 0.5 ? previous.longTop3Ids || [] : current.longTop3Ids || []
    };
}

function createInterpolatedHistory(history) {
    if (!Array.isArray(history) || history.length < 2) {
        return history;
    }

    const timeline = [history[0]];

    for (let index = 1; index < history.length; index += 1) {
        const previous = history[index - 1];
        const current = history[index];
        const gap = current.timestamp - previous.timestamp;
        const steps = Math.max(1, Math.ceil(gap / HISTORY_INTERPOLATION_STEP_MS));

        for (let step = 1; step < steps; step += 1) {
            const progress = step / steps;
            timeline.push(interpolateRankingSnapshot(previous, current, progress));
        }

        timeline.push(current);
    }

    return timeline;
}

function createRankingHistory(logs, limit = 10) {
    const times = Object.keys(logs || {}).sort();
    const history = [];

    for (const timeKey of times) {
        const timestamp = new Date(
            timeKey.slice(0, 16) + ":00Z"
        ).getTime();

        if (Number.isNaN(timestamp)) continue;

        const result = Ranking(logs, timestamp, limit);
        history.push({
            timeKey,
            timestamp,
            ranking: result.activeRanking || [],
            shortTopUser: result.shortTopUser,
            longTopUser: result.longTopUser,
            topUserId: result.topUserId,
            longTop3Ids: result.longTop3Ids || []
        });
    }

    return history;
}

async function resolveMembers(history, guild, client) {
    const userIds = [
        ...new Set(
            history.flatMap(({ ranking }) =>
                ranking.map(user => user.userId)
            )
        )
    ];
    const members = new Map();

    await Promise.all(userIds.map(async userId => {
        const member = guild?.members
            ? await guild.members.fetch(userId).catch(() => null)
            : null;
        const user = member?.user || (client?.users
            ? await client.users.fetch(userId).catch(() => null)
            : null);

        members.set(userId, member || user || null);
    }));

    return members;
}

async function createRankingVideo({
    guildId,
    guild,
    client,
    limit = 10,
    width = 1280,
    height = 720,
    fps = 24,
    onProgress
}) {
    console.log(`ランキング動画生成開始: ${guildId}`);

    const guildData = loadGuildData(guildId);
    const history = createRankingHistory(guildData.logs || {}, limit);

    if (history.length === 0) {
        throw new Error("ランキング履歴がありません");
    }

    const interpolatedHistory = createInterpolatedHistory(history);
    console.log(`ランキング履歴: ${history.length}件 / 補完済み: ${interpolatedHistory.length}件`);
    const members = await resolveMembers(interpolatedHistory, guild, client);
    const firstTimestamp = interpolatedHistory[0].timestamp;
    const lastTimestamp = interpolatedHistory[interpolatedHistory.length - 1].timestamp;
    const totalFrames = Math.max(
        1,
        Math.ceil(
            ((lastTimestamp - firstTimestamp) / DAY_MS) *
            VIDEO_SECONDS_PER_DAY *
            fps
        ) + 1
    );

    const outputPath = await createVideo({
        width,
        height,
        fps,
        totalFrames,
        output: OUTPUT_PATH,
        onProgress,
        async renderFrame({ frame, ctx }) {
            const elapsedVideoSeconds = frame / fps;
            const timestamp = Math.min(
                lastTimestamp,
                firstTimestamp +
                (elapsedVideoSeconds / VIDEO_SECONDS_PER_DAY) * DAY_MS
            );
            let currentIndex = interpolatedHistory.findIndex(
                item => item.timestamp >= timestamp
            );
            if (currentIndex <= 0) currentIndex = 1;
            if (currentIndex >= interpolatedHistory.length) currentIndex = interpolatedHistory.length - 1;

            const previousIndex = Math.max(0, currentIndex - 1);
            const previous = interpolatedHistory[previousIndex];
            const current = interpolatedHistory[currentIndex];
            const interval = current.timestamp - previous.timestamp;
            const progress = previousIndex === currentIndex || interval <= 0
                ? 1
                : (timestamp - previous.timestamp) / interval;
            const easedProgress = progress * progress * (3 - 2 * progress);

            ctx.fillStyle = "#111";
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = "#fff";
            ctx.font = "bold 42px sans-serif";
            ctx.fillText("アクティブメンバーランキング", 50, 60);
            ctx.font = "24px sans-serif";
            ctx.fillStyle = "#aaa";
            ctx.fillText(new Date(timestamp).toLocaleString("ja-JP"), 50, 100);

            const previousUsers = new Map(
                previous.ranking.map(user => [user.userId, user])
            );
            const currentUsers = new Map(
                current.ranking.map(user => [user.userId, user])
            );
            const visibleUserIds = new Set([
                ...previousUsers.keys(),
                ...currentUsers.keys()
            ]);
            const getRank = (user, fallback) => user?.rank || fallback;
            const getRatio = user => user
                ? Math.max(user.shortRatio, user.longRatio)
                : 0;
            const max = Math.max(
                ...[...visibleUserIds].map(userId => {
                    const from = previousUsers.get(userId);
                    const to = currentUsers.get(userId);
                    return getRatio(from) +
                        (getRatio(to) - getRatio(from)) * easedProgress;
                }),
                1
            );

            ctx.textBaseline = "middle";
            for (const userId of visibleUserIds) {
                const from = previousUsers.get(userId);
                const to = currentUsers.get(userId);
                const fromRank = getRank(from, limit + 1);
                const toRank = getRank(to, limit + 1);
                const rank = fromRank + (toRank - fromRank) * easedProgress;
                const y = 160 + (rank - 1) * 52;
                const opacity = from && to
                    ? 1
                    : from
                        ? 1 - easedProgress
                        : easedProgress;
                const short = (from?.short || 0) +
                    ((to?.short || 0) - (from?.short || 0)) * easedProgress;
                const long = (from?.long || 0) +
                    ((to?.long || 0) - (from?.long || 0)) * easedProgress;
                const ratio = Math.max(
                    (from?.shortRatio || 0) +
                        ((to?.shortRatio || 0) - (from?.shortRatio || 0)) * easedProgress,
                    (from?.longRatio || 0) +
                        ((to?.longRatio || 0) - (from?.longRatio || 0)) * easedProgress
                );
                const member = members.get(userId);
                const type = (to || from)?.shortRatio >= (to || from)?.longRatio
                    ? "短期"
                    : "長期";
                const roles = [];
                if (current.topUserId === userId) {
                    roles.push("雑談王");
                }
                else if (current.longTopUser === userId) {
                    roles.push("長期一位");
                }
                else if (current.shortTopUser === userId) {
                    roles.push("短期一位");
                }
                else if (current.longTop3Ids.includes(userId)) {
                    roles.push("アクティブtop3");
                }
                const roleText = roles.length
                    ? `, ${roles.join(", ")}`
                    : "";
                const displayName = member?.displayName ||
                    member?.globalName ||
                    member?.username ||
                    userId;

                ctx.globalAlpha = opacity;
                ctx.fillStyle = "#fff";
                ctx.font = "bold 26px sans-serif";
                ctx.fillText(`${Math.round(rank)}.`, 50, y);
                ctx.font = "22px sans-serif";
                ctx.fillText(`${displayName} (${type}${roleText})`, 110, y);
                ctx.fillStyle = "#4c8bf5";
                ctx.fillRect(350, y - 20, (ratio / max) * 650, 28);
                ctx.fillStyle = "#fff";
                ctx.font = "20px sans-serif";
                ctx.fillText(`S${Math.round(short)}, L${Math.round(long)}`, 1020, y);
                ctx.globalAlpha = 1;
            }
        }
    });

    console.log(`ランキング動画生成完了: ${outputPath}`);
    return outputPath;
}

module.exports = {
    createRankingVideo,
    createRankingHistory
};
