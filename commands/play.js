const { SlashCommandBuilder } = require("discord.js");
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    NoSubscriberBehavior,
    VoiceConnectionStatus,
    entersState,
    StreamType,
    getVoiceConnection,
} = require("@discordjs/voice");

const { spawn } = require("child_process");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("play")
        .setDescription("MuseScore"),

    async execute(interaction) {
        try {

            const nacl = require("tweetnacl");
            console.log(nacl);
            console.log("=================================");
            console.log("musescore command start");
            console.log("=================================");

            const channel = interaction.member?.voice?.channel;

            console.log("Guild:", interaction.guild?.name);
            console.log("Guild ID:", interaction.guild?.id);
            console.log("Channel:", channel?.name);
            console.log("Channel ID:", channel?.id);

            if (!channel) {
                return interaction.reply({
                    content: "ボイスチャンネルに入ってください。"
                });
            }

            await interaction.deferReply();
            console.log("deferReply OK");

            console.log("joinVoiceChannel 開始");

            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: interaction.guild.id,
                adapterCreator: interaction.guild.voiceAdapterCreator,

                selfDeaf: true,
                selfMute: false,
            });

            connection.on("debug", msg => {
                console.log("[VOICE DEBUG]", msg);
            });

            connection.on("error", err => {
                console.error("[VOICE ERROR]", err);
            });

            console.log("joinVoiceChannel 完了");
            console.log("joinConfig =", connection.joinConfig);
            console.log("初期状態 =", connection.state.status);

            connection.on("stateChange", (oldState, newState) => {
                console.log(
                    `[VC] ${oldState.status} -> ${newState.status}`
                );
            });

            setInterval(() => {
                console.log(connection.state.status);
            }, 1000);

            connection.on("error", err => {
                console.error("[VC ERROR]", err);
            });

            console.log("Ready待機開始");

            try {
                await entersState(
                    connection,
                    VoiceConnectionStatus.Ready,
                    20000
                );

            console.log("========== VOICE STATE ==========");
console.dir(connection.state, { depth: 5 });
console.log("================================");

                console.log("Ready到達");
            } catch (e) {
                console.error("Ready待機失敗");
                console.error("現在状態 =", connection.state.status);
                console.error(e);
                throw e;
            }

            console.log("========== CONNECTION STATE ==========");
console.dir(connection.state, { depth: 6 });
console.log("======================================");

            console.log("VC接続完了");

            console.log("FFmpeg起動");

            const ffmpeg = spawn("ffmpeg", [
                "-hide_banner",
                "-loglevel", "error",
                "-f", "dshow",
                "-i", "audio=CABLE Output (VB-Audio Virtual Cable)",
                "-vn",
                "-ac", "2",
                "-ar", "48000",
                "-acodec", "pcm_s16le",
                "-f", "s16le",
                "-"
            ]);

            console.log("FFmpeg PID =", ffmpeg.pid);

            ffmpeg.stderr.on("data", data => {
                console.log("[FFmpeg STDERR]");
                console.log(data.toString());
            });

            ffmpeg.stdout.on("data", chunk => {
                console.log(
                    `[FFmpeg DATA] ${chunk.length} bytes`
                );
            });

            ffmpeg.on("spawn", () => {
                console.log("FFmpeg spawn");
            });

            ffmpeg.on("close", code => {
                console.log(`[FFmpeg CLOSE] code=${code}`);
            });

            ffmpeg.on("exit", code => {
                console.log(`[FFmpeg EXIT] code=${code}`);
            });

            ffmpeg.on("error", err => {
                console.error("[FFmpeg ERROR]", err);
            });

            console.log("AudioPlayer生成");

            const player = createAudioPlayer({
                behaviors: {
                    noSubscriber: NoSubscriberBehavior.Play,
                },
            });

            player.on("stateChange", (oldState, newState) => {
                console.log(
                    `[Player] ${oldState.status} -> ${newState.status}`
                );
            });

            player.on(AudioPlayerStatus.Playing, () => {
                console.log("AudioPlayer Playing");
            });

            player.on(AudioPlayerStatus.Buffering, () => {
                console.log("AudioPlayer Buffering");
            });

            player.on(AudioPlayerStatus.Idle, () => {
                console.log("AudioPlayer Idle");
            });

            player.on("error", err => {
                console.error("[Player ERROR]", err);
            });

            console.log("Resource生成");

            const resource = createAudioResource(
                ffmpeg.stdout,
                {
                    inputType: StreamType.Raw
                }
            );

            console.log("subscribe開始");

            const subscribed = connection.subscribe(player);

            console.log(
                "subscribe結果 =",
                subscribed ? "成功" : "失敗"
            );

            if (!subscribed) {
                throw new Error("AudioPlayerをVoiceConnectionに購読できませんでした");
            }

            console.log("player.play開始");

            player.play(resource);
            setTimeout(() => {
    　　　　　console.log("========== 5秒後 ==========");
    　　　　　console.dir(connection.state, { depth: 5 });
    　　　　　console.dir(player.state, { depth: 5 });
    　　　　　console.log("==========================");
　　　　　　　}, 5000);

            console.log(
                "player.state =",
                player.state.status
            );

            await interaction.editReply("再生中");

            console.log("コマンド終了");

        } catch (err) {
            console.error("========== ERROR ==========");
            console.error(err);

            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(
                        "エラーが発生しました。"
                    );
                } else {
                    await interaction.reply(
                        "エラーが発生しました。"
                    );
                }
            } catch (e) {
                console.error("返信失敗", e);
            }
        }
    }
};