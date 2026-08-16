const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { loadEconomy, saveEconomy, addBalance, getUserEc, getCoinName, addServerTax } = require('../systems/economy');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('adjustbalance')
        .setDescription('他のユーザーの所持金を増減します（管理者専用）')
        .addUserOption(opt =>
            opt.setName('user')
                .setDescription('対象のユーザー')
                .setRequired(true))
        .addIntegerOption(opt =>
            opt.setName('amount')
                .setDescription('増減額（例: 100, -50）')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.editReply({
                content: 'このコマンドは管理者のみ使用できます。',
            });
        }
        if (!interaction.user.id === "1460532548064120865") {
            return interaction.editReply({
                content: 'imaはコマンドが使えませんでした',
            });
        }
        try {
            const guild = interaction.guild;
            if (!guild) return await interaction.editReply('サーバー情報が取得できませんでした。');

            const guildId = guild.id;
            const targetUser = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');

            if (!targetUser) return await interaction.editReply('ユーザーが確認できませんでした。');

            // 経済データロード
            const eco = loadEconomy();
            if (!eco) {
                console.error('[adjustbalance] loadEconomy returned falsy:', eco);
                return await interaction.editReply('経済データの読み込みに失敗しました。');
            }

            const guildData = eco.guilds?.[guildId] ?? {};
            const tax = Number(guildData.tax ?? 0); // undefined/null 対策

            // マイナス税チェック
            if (tax < 0) return await interaction.editReply(`税金がマイナスです。(${tax})`);
           
            // コイン名取得（互換性あり）
            let coinName = 'SSPC$';
            try {
                const maybe = getCoinName(guildId);
                if (maybe) coinName = maybe;
            } catch (e) {
                try {
                    const maybe2 = getCoinName(eco, guildId);
                    if (maybe2) coinName = maybe2;
                } catch (e2) {
                    console.warn('[adjustbalance] getCoinName failed both ways', e, e2);
                }
            }

            // 変更前残高
            const before = getUserEc(eco, guildId, targetUser.id);
            const beforeBalance = before?.balance ?? 0;

            console.log(`[adjustbalance] guild=${guildId} actor=${interaction.user.id} target=${targetUser.id} amount=${amount} before=${beforeBalance}`);

            // 残高更新
            try {
                addBalance(eco, guildId, targetUser.id, amount);

                try {
                    addServerTax(eco, guildId, -amount);
                } catch (taxErr) {
                    console.warn('[adjustbalance] addServerTax failed:', taxErr);
                }

            } catch (addErr) {
                console.error('[adjustbalance] addBalance failed:', addErr);
                return await interaction.editReply({ content: '残高更新中にエラーが発生しました（addBalance）。' });
            }

            // 保存
            try {
                const maybePromise = saveEconomy(eco);
                if (maybePromise?.then) await maybePromise;
            } catch (saveErr) {
                console.error('[adjustbalance] saveEconomy failed:', saveErr);
                return await interaction.editReply({ content: '経済データの保存に失敗しました。' });
            }

            // 変更後残高
            const after = getUserEc(eco, guildId, targetUser.id);
            const afterBalance = after?.balance ?? 'N/A';

            console.log(`[adjustbalance] update complete target=${targetUser.id} before=${beforeBalance} after=${afterBalance}`);

            const embed = new EmbedBuilder()
                .setColor(amount >= 0 ? 0x00ff00 : 0xff0000)
                .setAuthor({ name: targetUser.tag, iconURL: targetUser.displayAvatarURL?.() })
                .setTitle('所持金が調整されました')
                .addFields(
                    { name: '調整額', value: `${amount >= 0 ? '+' : ''}${amount} ${coinName}`, inline: true },
                    { name: '変更前残高', value: `${beforeBalance} ${coinName}`, inline: true },
                    { name: '変更後残高', value: `${afterBalance} ${coinName}`, inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // ログ送信
            const logChannelId = '1458426987122135234';
            const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
            if (logChannel) {
                await logChannel.send({ embeds: [embed] }).catch(err => console.warn('[adjustbalance] logChannel.send failed:', err));
            }

        } catch (err) {
            console.error('[adjustbalance] unexpected error:', err);
            try {
                await interaction.editReply({ content: '⚠ 所持金の調整中に予期せぬエラーが発生しました。' });
            } catch (e) { /* ignore */ }
        }
    },
};
