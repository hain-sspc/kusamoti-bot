const SHORT_TIME = 24 * 60 * 60 * 1000;
const LONG_TIME = 72 * 60 * 60 * 1000;

function parseLogTime(timeKey) {
    const timestamp = new Date(
        `${String(timeKey).slice(0, 16)}:00Z`
    ).getTime();

    return Number.isFinite(timestamp) ? timestamp : null;
}

function addTotals(target, users) {
    for (const [userId, rawCount] of Object.entries(users || {})) {
        const count = Number(rawCount);
        if (!Number.isFinite(count)) continue;
        target[userId] = (target[userId] || 0) + count;
    }
}

function calculateTotals(logs, timestamp = Date.now()) {
    const shortTotals = {};
    const longTotals = {};

    for (const [timeKey, record] of Object.entries(logs || {})) {
        const logTime = parseLogTime(timeKey);
        if (logTime === null) continue;

        const age = timestamp - logTime;
        if (age < 0) continue;

        if (age <= SHORT_TIME) {
            addTotals(shortTotals, record?.users);
        }
        if (age <= LONG_TIME) {
            addTotals(longTotals, record?.users);
        }
    }

    return { shortTotals, longTotals };
}

function calculateMessageRanking(totals, limit = 10) {
    return Object.entries(totals || {})
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, limit)
        .map(([userId, count], index) => ({
            rank: index + 1,
            userId,
            count
        }));
}

function calculateActiveRanking(shortTotals, longTotals, limit = 10) {
    const totalShortCount = Object.values(shortTotals || {})
        .reduce((total, count) => total + count, 0);
    const totalLongCount = Object.values(longTotals || {})
        .reduce((total, count) => total + count, 0);
    const userIds = new Set([
        ...Object.keys(shortTotals || {}),
        ...Object.keys(longTotals || {})
    ]);

    return [...userIds]
        .map(userId => {
            const short = shortTotals[userId] || 0;
            const long = longTotals[userId] || 0;
            const shortRatio = totalShortCount
                ? short / totalShortCount
                : 0;
            const longRatio = totalLongCount
                ? long / totalLongCount
                : 0;

            return {
                userId,
                short,
                long,
                shortRatio,
                longRatio,
                type: shortRatio >= longRatio ? "短期" : "長期"
            };
        })
        .sort((a, b) => {
            const ratioDifference = Math.max(b.shortRatio, b.longRatio) -
                Math.max(a.shortRatio, a.longRatio);
            if (ratioDifference !== 0) return ratioDifference;

            const countDifference = (b.short + b.long) - (a.short + a.long);
            return countDifference || a.userId.localeCompare(b.userId);
        })
        .slice(0, limit)
        .map((user, index) => ({
            rank: index + 1,
            ...user
        }));
}

function Ranking(logs, timestamp = Date.now(), limit = 10) {
    const { shortTotals, longTotals } = calculateTotals(logs, timestamp);
    const shortRanking = calculateMessageRanking(shortTotals, limit);
    const longRanking = calculateMessageRanking(longTotals, limit);
    const activeRanking = calculateActiveRanking(shortTotals, longTotals, limit);
    const shortTopUser = shortRanking[0]?.userId || null;
    const longTopUser = longRanking[0]?.userId || null;

    return {
        shortTotals,
        longTotals,
        shortRanking,
        longRanking,
        activeRanking,
        shortTopUser,
        longTopUser,
        topUserId: shortTopUser && longTopUser && shortTopUser === longTopUser
            ? shortTopUser
            : null,
        longTop3Ids: longRanking.slice(0, 3).map(user => user.userId)
    };
}

module.exports = {
    Ranking,
    calculateTotals,
    calculateMessageRanking,
    calculateActiveRanking
};
