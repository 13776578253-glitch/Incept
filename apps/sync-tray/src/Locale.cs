using System;
using System.Globalization;

namespace InceptSync
{
    internal enum Language
    {
        Zh,
        En
    }

    // The tray reads its language once at startup from tray-settings.json and
    // exposes Changed so every window can repaint instead of restarting.
    internal static class Locale
    {
        public static Language Current { get; private set; }

        public static event EventHandler Changed;

        public static bool IsEnglish
        {
            get { return Current == Language.En; }
        }

        public static void Initialize(string stateDirectory)
        {
            TrayPreferences.Initialize(stateDirectory);
            string saved = TrayPreferences.Get("language");
            if (saved == "en")
            {
                Current = Language.En;
            }
            else if (saved == "zh")
            {
                Current = Language.Zh;
            }
            else
            {
                // No explicit choice yet: follow the Windows display language.
                Current = SystemDefault();
            }
            RaiseChanged();
        }

        public static void SetLanguage(Language language)
        {
            if (Current == language)
            {
                return;
            }
            Current = language;
            TrayPreferences.Set("language", language == Language.En ? "en" : "zh");
            RaiseChanged();
        }

        public static string Pick(string chinese, string english)
        {
            return IsEnglish ? english : chinese;
        }

        public static string Format(string chinese, string english, params object[] arguments)
        {
            return string.Format(CultureInfo.InvariantCulture, IsEnglish ? english : chinese, arguments);
        }

        private static Language SystemDefault()
        {
            try
            {
                return CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "zh" ? Language.Zh : Language.En;
            }
            catch
            {
                return Language.Zh;
            }
        }

        private static void RaiseChanged()
        {
            EventHandler changed = Changed;
            if (changed != null)
            {
                changed(null, EventArgs.Empty);
            }
        }
    }

    // Both translations of every user-visible string, kept side by side so a new
    // string cannot ship in one language only.
    internal static class Strings
    {
        // Settings window.
        public static string SettingsTitle { get { return Locale.Pick("设置", "Settings"); } }
        public static string DeviceId { get { return Locale.Pick("设备 ID", "Device ID"); } }
        public static string Endpoint { get { return Locale.Pick("服务端点", "Service endpoint"); } }
        public static string StateDirectory { get { return Locale.Pick("状态目录", "State directory"); } }
        public static string SyncInterval { get { return Locale.Pick("同步间隔", "Sync interval"); } }
        public static string IntervalSuffix { get { return Locale.Pick("（由 Agent 控制）", " (set by the Agent)"); } }
        public static string SourcesLabel { get { return Locale.Pick("已授权来源", "Allowed sources"); } }
        public static string SourcesUnknown { get { return Locale.Pick("未读取到来源列表", "No source list available"); } }
        public static string BindingHint
        {
            get
            {
                return Locale.Pick("设备信息来自绑定配置。更换设备或服务端点时，请重新绑定。",
                    "Device details come from the binding file. Re-bind to change the device or endpoint.");
            }
        }
        public static string EditSources { get { return Locale.Pick("编辑来源", "Edit sources"); } }
        public static string OpenFolder { get { return Locale.Pick("打开状态目录", "Open folder"); } }
        public static string RestartAgent { get { return Locale.Pick("重启 Agent", "Restart Agent"); } }
        public static string Done { get { return Locale.Pick("完成", "Done"); } }
        public static string AutoStart
        {
            get { return Locale.Pick("登录 Windows 时启动托盘（当前用户）", "Start the tray when Windows starts (this user)"); }
        }
        public static string Appearance { get { return Locale.Pick("外观", "Appearance"); } }
        public static string Light { get { return Locale.Pick("浅色", "Light"); } }
        public static string Dark { get { return Locale.Pick("深色", "Dark"); } }
        public static string FollowSystem { get { return Locale.Pick("跟随系统", "System"); } }
        public static string LanguageLabel { get { return Locale.Pick("语言", "Language"); } }
        public static string Restarting { get { return Locale.Pick("正在重启 Agent…", "Restarting the Agent…"); } }
        public static string Restarted { get { return Locale.Pick("Agent 已重启，将按新策略采集。", "The Agent restarted and will collect under the new policy."); } }
        public static string RestartFailedPrefix { get { return Locale.Pick("重启失败：", "Restart failed: "); } }
        public static string RestartTimeout { get { return Locale.Pick("Agent 未在预期时间内停止，请稍后重试。", "The Agent did not stop in time. Try again shortly."); } }
        public static string AgentElevated
        {
            get
            {
                return Locale.Pick("Agent 正以管理员权限运行，托盘无法控制它。请关闭该 Agent，再点“重启 Agent”。",
                    "The Agent runs elevated, so the tray cannot control it. Close that Agent, then press Restart Agent.");
            }
        }
        public static string BrowserFailedPrefix { get { return Locale.Pick("无法打开浏览器：", "Could not open the browser: "); } }
        public static string NoEndpoint { get { return Locale.Pick("设备尚未绑定，没有可用的服务端点。", "This device is not bound, so there is no endpoint."); } }
        public static string AutoStartFailedPrefix { get { return Locale.Pick("无法更新登录启动项：", "Could not update the startup entry: "); } }
        public static string ThemeFailed { get { return Locale.Pick("无法保存外观设置，请检查状态目录是否可写。", "Could not save appearance settings. Check that the state directory is writable."); } }
        public static string LanguageFailed { get { return Locale.Pick("无法保存语言设置，请检查状态目录是否可写。", "Could not save the language. Check that the state directory is writable."); } }

        // Status popup.
        public static string StatusTitle { get { return Locale.Pick("Incept Sync · 状态", "Incept Sync · Status"); } }
        public static string SyncNow { get { return Locale.Pick("立即同步", "Sync now"); } }
        public static string OpenDashboard { get { return Locale.Pick("打开 Incept Dashboard", "Open Incept Dashboard"); } }
        public static string ResumeSync { get { return Locale.Pick("恢复同步", "Resume sync"); } }
        public static string PauseSync { get { return Locale.Pick("暂停同步", "Pause sync"); } }
        public static string ViewLog { get { return Locale.Pick("查看日志", "View log"); } }
        public static string Settings { get { return Locale.Pick("设置", "Settings"); } }
        public static string QuitApp { get { return Locale.Pick("退出 Incept Sync", "Quit Incept Sync"); } }
        public static string LastSync { get { return Locale.Pick("上次同步", "Last sync"); } }
        public static string Interval { get { return Locale.Pick("同步间隔", "Interval"); } }
        public static string LastError { get { return Locale.Pick("最近错误", "Last error"); } }
        public static string Pending { get { return Locale.Pick("待上传", "Pending"); } }
        public static string StateIdle { get { return Locale.Pick("正常运行", "Running"); } }
        public static string StateCollecting { get { return Locale.Pick("正常运行 · 正在采集", "Running · collecting"); } }
        public static string StateUploading { get { return Locale.Pick("上传中", "Uploading"); } }
        public static string StatePaused { get { return Locale.Pick("已暂停 · 不会自动同步", "Paused · automatic sync off"); } }
        public static string StateAttention { get { return Locale.Pick("需要处理 · ", "Needs attention · "); } }
        public static string AttentionReview { get { return Locale.Pick("审查待处理", "Review required"); } }
        public static string AttentionHeld { get { return Locale.Pick("保留批次待处理", "Held batches"); } }
        public static string AttentionQuarantined { get { return Locale.Pick("隔离批次待处理", "Quarantined batches"); } }
        public static string AttentionLineage { get { return Locale.Pick("历史谱系冲突", "Lineage conflict"); } }
        public static string StateOffline { get { return Locale.Pick("未运行", "Not running"); } }
        public static string UnknownError { get { return Locale.Pick("未知错误", "Unknown error"); } }

        // Tray notifications and tooltip.
        public static string TrayRunning { get { return Locale.Pick("正常运行", "Running"); } }
        public static string TrayUploading { get { return Locale.Pick("上传中", "Uploading"); } }
        public static string TrayPaused { get { return Locale.Pick("已暂停", "Paused"); } }
        public static string TrayAttention { get { return Locale.Pick("需要处理", "Needs attention"); } }
        public static string TrayOffline { get { return Locale.Pick("未运行", "Not running"); } }
        public static string AttentionTitle { get { return Locale.Pick("同步需要处理", "Sync needs attention"); } }
        public static string AttentionSuffix { get { return Locale.Pick("，打开托盘查看详情。", ", open the tray for details."); } }
        public static string NotBoundTitle { get { return Locale.Pick("尚未绑定设备", "No device bound"); } }
        public static string NotBoundText { get { return Locale.Pick("请先运行 windows\\Bind.ps1 完成设备绑定。", "Run windows\\Bind.ps1 to bind this device first."); } }
        public static string StartedTitle { get { return Locale.Pick("Incept Sync 已启动", "Incept Sync started"); } }
        public static string StartedText { get { return Locale.Pick("Agent 正在后台运行，图标会显示同步状态。", "The Agent runs in the background; the icon shows sync status."); } }
        public static string StartFailedTitle { get { return Locale.Pick("无法启动 Agent", "Could not start the Agent"); } }
        public static string AgentStoppedTitle { get { return Locale.Pick("Agent 未运行", "The Agent is not running"); } }
        public static string AgentStoppedText { get { return Locale.Pick("已请求启动 Agent，请稍后再点立即同步。", "Start requested. Try Sync now again in a moment."); } }
        public static string SyncQueued { get { return Locale.Pick("已排队，稍后完成采集与上传。", "Queued; collection and upload will follow."); } }
        public static string SyncFailedPrefix { get { return Locale.Pick("立即同步失败：", "Sync now failed: "); } }
        public static string PausedTitle { get { return Locale.Pick("已暂停同步", "Sync paused"); } }
        public static string ResumedTitle { get { return Locale.Pick("已恢复同步", "Sync resumed"); } }
        public static string PausedText { get { return Locale.Pick("自动同步已暂停，立即同步仍可用。", "Automatic sync is paused; Sync now still works."); } }
        public static string ResumedText { get { return Locale.Pick("自动同步已恢复。", "Automatic sync resumed."); } }
        public static string NoEndpointTitle { get { return Locale.Pick("没有可用的端点", "No endpoint"); } }
        public static string NoEndpointText { get { return Locale.Pick("设备尚未绑定。", "This device is not bound."); } }
        public static string DashboardFailedPrefix { get { return Locale.Pick("无法打开 Dashboard：", "Could not open the dashboard: "); } }
        public static string NoLogTitle { get { return Locale.Pick("没有日志", "No log yet"); } }
        public static string NoLogText { get { return Locale.Pick("Agent 尚未写入日志。", "The Agent has not written a log yet."); } }
        public static string CommandTimeout { get { return Locale.Pick("命令超时", "Command timed out"); } }
        public static string ExitCodePrefix { get { return Locale.Pick("退出码 ", "exit code "); } }

        // Status snapshot formatting.
        public static string NoRecord { get { return Locale.Pick("尚无记录", "No data yet"); } }
        public static string JustNow { get { return Locale.Pick("刚刚", "just now"); } }
        public static string MinutesAgo { get { return Locale.Pick("{0} 分钟前", "{0} min ago"); } }
        public static string HoursAgo { get { return Locale.Pick("{0} 小时前", "{0} h ago"); } }
        public static string DaysAgo { get { return Locale.Pick("{0} 天前", "{0} d ago"); } }
        public static string MinutesShort { get { return Locale.Pick("{0} 分钟", "{0} min"); } }
        public static string Batches { get { return Locale.Pick("{0} 个批次", "{0} batches"); } }
        public static string None { get { return Locale.Pick("无", "None"); } }

        // Exit dialog.
        public static string ExitWindow { get { return Locale.Pick("Incept Sync · 退出", "Incept Sync · Quit"); } }
        public static string ExitTitle { get { return Locale.Pick("退出 Incept Sync", "Quit Incept Sync"); } }
        public static string ExitPending
        {
            get
            {
                return Locale.Pick("还有 {0} 个批次待上传。退出托盘不会丢失数据，Agent 会继续补传。",
                    "{0} batches are still pending. Closing the tray loses no data; the Agent keeps uploading.");
            }
        }
        public static string ExitPrompt
        {
            get
            {
                return Locale.Pick("选择退出方式。退出托盘后 Agent 仍在后台同步。",
                    "Choose how to exit. After closing the tray the Agent keeps syncing in the background.");
            }
        }
        public static string ExitTrayOnly { get { return Locale.Pick("仅退出托盘", "Close tray only"); } }
        public static string ExitStopAgent { get { return Locale.Pick("停止 Agent 并退出", "Stop the Agent and quit"); } }
        public static string ExitCancel { get { return Locale.Pick("取消", "Cancel"); } }
    }
}
