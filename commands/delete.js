const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionFlagsBits, ChannelType } = require('discord.js');

function parseDelayToDate(delayStr) {
    const match = delayStr.match(/^(\d+)([smh])$/);
    if (!match) return null;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const now = Date.now();

    let offset = 0;
    switch (unit) {
        case 's': offset = value * 1000; break;
        case 'm': offset = value * 60 * 1000; break;
        case 'h': offset = value * 60 * 60 * 1000; break;
        default: return null;
    }

    return new Date(now - offset);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('delete')
        .setDescription('スレッドを削除します')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('削除タイプ')
                .setRequired(true)
                .addChoices(
                    { name: 'thread', value: 'thread' },
                ))
        .addStringOption(option =>
            option.setName('delay')
                .setDescription('今からどれくらい前までを削除対象にするか（例: 2h, 30m）')
                .setRequired(true))
    // ここは setDefaultMemberPermissions は使わずにコード内で権限チェックするので外す
    ,

    async execute(interaction) {
        console.log('コマンド実行開始');

        // 権限チェック：メッセージ管理権限か管理者権限がなければ拒否
        const member = interaction.member;
        if (!member.permissions.has(PermissionFlagsBits.ManageMessages) && !member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ このコマンドを使うにはメッセージ管理権限または管理者権限が必要です。', ephemeral: false });
        }

        const type = interaction.options.getString('type');
        const delayStr = interaction.options.getString('delay');
        const guild = interaction.guild;

        // ephemeral を外して即返信する場合は deferReply しない
        // もし処理時間長いなら deferReply を使い、editReply に書き換える形もあり
        await interaction.deferReply({ ephemeral: false });

        console.log(`type=${type}, delayStr=${delayStr}`);

        if (type !== 'thread') {
            console.log('未対応typeで中断');
            return interaction.editReply('❌ 未対応のtypeです。');
        }

        const cutoff = parseDelayToDate(delayStr);
        if (!cutoff) {
            console.log('delay形式不正で中断');
            return interaction.editReply('❌ delay形式が不正です（例: 2h, 30m）');
        }

        console.log(`cutoff日時: ${cutoff.toISOString()}`);

        let deletedCount = 0;
        const channels = await guild.channels.fetch();

        console.log(`チャンネル総数: ${channels.size}`);

        for (const [, channel] of channels) {
            console.log(`処理中チャンネル: ${channel.name} (${channel.type})`);
            console.log(`channel.threads:`, channel.threads);

            if (
                !channel ||
                ![ChannelType.GuildText, ChannelType.GuildForum, ChannelType.GuildNews].includes(channel.type)
            ) {
                console.log(`スキップ: 対象外チャンネルタイプ`);
                continue;
            }

            try {
                const threads = await channel.threads.fetch();
                console.log(`取得スレッド数: ${threads.threads.size}`);

                for (const [, thread] of threads.threads) {
                    console.log(`スレッド名: ${thread.name}, 作成日時: ${thread.createdAt.toISOString()}, cutoff: ${cutoff.toISOString()}`);

                    if (thread.createdAt > cutoff) {
                        console.log(`削除対象: ${thread.name}`);
                        await thread.delete(`作成から ${delayStr} 以内`);
                        deletedCount++;
                    } else {
                        console.log(`削除対象外: ${thread.name}`);
                    }
                }

            } catch (err) {
                console.warn(`スレッド取得失敗: ${channel.name} (${channel.type})`, err.message);
            }
        }

        try {
            const activeThreads = await guild.channels.fetchActiveThreads();
            console.log(`ギルドのアクティブスレッド数: ${activeThreads.threads.size}`);
        } catch (err) {
            console.warn('ギルドのアクティブスレッド取得失敗', err.message);
        }

        console.log(`削除完了 件数: ${deletedCount}`);

        return interaction.editReply(`🧹 ${deletedCount} 件のスレッドを削除しました（作成から ${delayStr} 以内）。`);
    }
};
0