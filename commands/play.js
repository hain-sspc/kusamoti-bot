const { SlashCommandBuilder } = require('@discordjs/builders');
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    StreamType,
    entersState,
    VoiceConnectionStatus,
} = require('@discordjs/voice');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('YouTubeのURLから音声をダウンロードして再生します')
        .addStringOption(option => option.setName('url').setDescription('YouTubeのURL').setRequired(true)),

    async execute(interaction) {
        const url = interaction.options.getString('url');
        const voiceChannel = interaction.member.voice.channel;

        if (!voiceChannel) {
            return interaction.reply('先にボイスチャンネルに入ってください。');
        }

        await interaction.deferReply();

        const tmpDir = os.tmpdir();
        const tmpM4A = path.join(tmpDir, 'temp.m4a');

        try {
            const ytdlpPath = 'C:\\yt-dlp\\yt-dlp-master\\yt-dlp.cmd';
            const ffmpegPath = 'C:\\ffmpeg\\bin\\ffmpeg.exe';

            // ① YouTube音声をダウンロード（m4a）
            console.log('yt-dlpを起動して音声をダウンロード中...');
            await new Promise((resolve, reject) => {
                const ytdlpProcess = spawn('cmd.exe', [
                    '/c', ytdlpPath,
                    '-f', 'bestaudio[ext=m4a]',
                    '-o', tmpM4A,
                    url
                ], { stdio: ['ignore', 'inherit', 'inherit'] });

                ytdlpProcess.on('close', code => {
                    console.log(`yt-dlp終了コード: ${code}`);
                    if (code === 0 && fs.existsSync(tmpM4A)) {
                        console.log('ダウンロード成功: ' + tmpM4A);
                        resolve();
                    } else {
                        reject(new Error(`yt-dlp failed. Code: ${code}`));
                    }
                });

                ytdlpProcess.on('error', err => {
                    console.error('yt-dlp起動失敗:', err);
                    reject(err);
                });
            });

            // ② ffmpegでm4aをPCM生ストリームに変換しながら再生
            console.log('ffmpegを起動してPCMストリームに変換中...');
            const ffmpegProcess = spawn(ffmpegPath, [
                '-hide_banner',
                '-loglevel', 'error',
                '-i', tmpM4A,
                '-f', 's16le',
                '-ar', '48000',
                '-ac', '2',
                'pipe:1'
            ], { stdio: ['ignore', 'pipe', 'inherit'] });

            ffmpegProcess.stdout.on('data', chunk => {
                console.log(`ffmpeg stdout data length: ${chunk.length}`);
            });

            ffmpegProcess.on('error', err => {
                console.error('ffmpegプロセスエラー:', err);
            });

            ffmpegProcess.on('close', code => {
                console.log(`ffmpegプロセス終了コード: ${code}`);
            });

            // ③ Discordで再生
            console.log('ボイスチャンネルに接続中...');
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: interaction.guild.id,
                adapterCreator: interaction.guild.voiceAdapterCreator,
            });

            // connectionがReadyになるまで最大30秒待つ
            await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
            console.log('VoiceConnection is ready.');

            const player = createAudioPlayer();

            player.on('error', error => {
                console.error('[AudioPlayer error]', error);
                interaction.followUp('再生中にエラーが発生しました。');
                connection.destroy();
                fs.unlink(tmpM4A, () => { });
            });

            player.on(AudioPlayerStatus.Playing, () => {
                console.log('AudioPlayerStatus: Playing');
                interaction.editReply('再生を開始しました！').catch(() => { });
            });

            player.on(AudioPlayerStatus.Idle, () => {
                console.log('AudioPlayerStatus: Idle（再生終了または停止）');
                connection.destroy();
                fs.unlink(tmpM4A, () => { });
            });

            player.on(AudioPlayerStatus.Paused, () => {
                console.log('AudioPlayerStatus: Paused');
            });

            player.on(AudioPlayerStatus.AutoPaused, () => {
                console.log('AudioPlayerStatus: AutoPaused');
            });

            console.log('オーディオリソースを作成中...');
            const resource = createAudioResource(ffmpegProcess.stdout, {
                inputType: StreamType.Raw,
                inlineVolume: true,
            });
            resource.volume.setVolume(1.0);

            console.log('AudioPlayerで再生開始...');
            player.play(resource);
            console.log('AudioPlayer.play() を呼び出しました。');

            const subscription = connection.subscribe(player);
            console.log('connection.subscribe 戻り値:', subscription);
            if (!subscription) {
                console.warn('AudioPlayerの購読に失敗しています！');
            }
        } catch (error) {
            console.error('playコマンドエラー:', error);
            try {
                await interaction.editReply('再生に失敗しました。');
            } catch { }
        }
    }
};
