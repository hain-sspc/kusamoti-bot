const { Events, ActivityType } = require('discord.js');
const invitesCache = require("../data/invitesCache");
const {flushMinuteData} = require("../messageLogger");
const ai = require('../systems/ai');

module.exports = {
    name: Events.ClientReady,
    async execute(client) {
        try {
            process.title = `[kusamoti bot]`
            console.log(`ログイン成功: ${client.user.tag}`);

          
            // サーバー数
            const guildCount = client.guilds.cache.size;

            // ユニークユーザー数
            const uniqueUsers = new Set();
            for (const guild of client.guilds.cache.values()) {
                const members = await guild.members.fetch();
                members.forEach(member => {
                    if (!member.user.bot) uniqueUsers.add(member.id);
                });
            }

            const statusText = `${guildCount}サーバー | ${uniqueUsers.size}人`;

            client.user.setPresence({
                activities: [{ name: statusText, type: ActivityType.Watching }],
                status: "online",
            });

            console.log(`ステータスを更新しました: ${statusText}`);

                await ai.train();
                console.log("AI ready");


            for (const guild of client.guilds.cache.values()) {
                try {
                    const invites = await guild.invites.fetch();

                    const inviteMap = new Map();

                    for (const invite of invites.values()) {
                        inviteMap.set(invite.code, {
                            uses: invite.uses ?? 0
                        });
                    }

                    invitesCache.set(guild.id, inviteMap);

                } catch (error) {
                    console.error(
                        `招待情報取得失敗: ${guild.name}`
                    );
                }
            }

            flushMinuteData(client);
                    setInterval(() => flushMinuteData(client), 60 * 1000);
        } catch (error) {
            console.log(error);

        }
    }
};