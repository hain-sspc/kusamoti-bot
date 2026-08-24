// systems/Ranking.js

const SHORT_TIME = 24 * 60 * 60 * 1000;
const LONG_TIME = 72 * 60 * 60 * 1000;


/**
 * ログから24時間・72時間のメッセージ数を集計
 *
 * @param {Object} logs
 * @param {number} timestamp
 * @returns {{
 *   shortTotals: Object,
 *   longTotals: Object
 * }}
 */
function calculateTotals(logs, timestamp = Date.now()) {
    const shortTotals = {};
    const longTotals = {};

    for (const [timeKey, record] of Object.entries(logs || {})) {
        const time = new Date(
            timeKey.slice(0, 16) + ":00Z"
        ).getTime();

        const age = timestamp - time;

        // 未来のログは無視
        if (age < 0) continue;

        for (const [userId, count] of Object.entries(record.users || {})) {
            if (age <= SHORT_TIME) {
                shortTotals[userId] =
                    (shortTotals[userId] || 0) + count;
            }

            if (age <= LONG_TIME) {
                longTotals[userId] =
                    (longTotals[userId] || 0) + count;
            }
        }
    }

    return {
        shortTotals,
        longTotals
    };
}


/**
 * メッセージ数ランキング
 *
 * @param {Object} totals
 * @param {number} limit
 * @returns {Array}
 */
function calculateMessageRanking(totals, limit = 10) {
    return Object.entries(totals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([userId, count], index) => ({
            rank: index + 1,
            userId,
            count
        }));
}


/**
 * アクティブメンバーランキング
 *
 * 現在のBotで使用している
 * 「短期・長期の割合が高い順」
 * のルールを使用
 *
 * @param {Object} shortTotals
 * @param {Object} longTotals
 * @param {number} limit
 * @returns {Array}
 */
function calculateActiveRanking(
    shortTotals,
    longTotals,
    limit = 10
) {
    const totalShortCount = Object.values(shortTotals)
        .reduce((a, b) => a + b, 0);

    const totalLongCount = Object.values(longTotals)
        .reduce((a, b) => a + b, 0);

    const userIds = new Set([
        ...Object.keys(shortTotals),
        ...Object.keys(longTotals)
    ]);

    const candidates = [];

    for (const userId of userIds) {
        const short = shortTotals[userId] || 0;
        const long = longTotals[userId] || 0;

        const shortRatio = totalShortCount
            ? short / totalShortCount
            : 0;

        const longRatio = totalLongCount
            ? long / totalLongCount
            : 0;

        candidates.push({
            userId,
            short,
            long,
            shortRatio,
            longRatio,

            type: shortRatio >= longRatio
                ? "短期"
                : "長期"
        });
    }

    return candidates
        .sort((a, b) => {
            const maxA = Math.max(
                a.shortRatio,
                a.longRatio
            );

            const maxB = Math.max(
                b.shortRatio,
                b.longRatio
            );

            // 割合が高い順
            if (maxB !== maxA) {
                return maxB - maxA;
            }

            // 同率ならメッセージ数
            const totalA = a.short + a.long;
            const totalB = b.short + b.long;

            return totalB - totalA;
        })
        .slice(0, limit)
        .map((user, index) => ({
            rank: index + 1,
            ...user
        }));
}


/**
 * ログからすべてのランキングを取得
 *
 * @param {Object} logs
 * @param {number} timestamp
 * @param {number} limit
 */
function Ranking(
    logs,
    timestamp = Date.now(),
    limit = 10
) {
    const {
        shortTotals,
        longTotals
    } = calculateTotals(
        logs,
        timestamp
    );

    // 短期ランキング
    const shortRanking =
        calculateMessageRanking(
            shortTotals,
            limit
        );

    // 長期ランキング
    const longRanking =
        calculateMessageRanking(
            longTotals,
            limit
        );

    // アクティブランキング
    const activeRanking =
        calculateActiveRanking(
            shortTotals,
            longTotals,
            limit
        );

    // 短期1位
    const shortTopUser =
        shortRanking[0]?.userId || null;

    // 長期1位
    const longTopUser =
        longRanking[0]?.userId || null;

    // 短期・長期両方1位なら雑談王
    const topUserId =
        shortTopUser &&
        longTopUser &&
        shortTopUser === longTopUser
            ? shortTopUser
            : null;

    // 長期TOP3
    const longTop3Ids =
        longRanking
            .slice(0, 3)
            .map(user => user.userId);

    return {
        shortTotals,
        longTotals,

        shortRanking,
        longRanking,
        activeRanking,

        shortTopUser,
        longTopUser,
        topUserId,

        longTop3Ids
    };
}


module.exports = {
    Ranking,
    calculateTotals,
    calculateMessageRanking,
    calculateActiveRanking
};