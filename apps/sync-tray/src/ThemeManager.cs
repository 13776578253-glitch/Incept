using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using Microsoft.Win32;

namespace InceptSync
{
    internal enum ThemeMode { System, Light, Dark }

    internal static class ThemeManager
    {
        private static string _preferencesPath;
        private static bool _systemDark = ReadSystemDark();
        public static ThemeMode Mode { get; private set; }
        public static event EventHandler Changed;
        public static bool IsDark { get { return Mode == ThemeMode.Dark || (Mode == ThemeMode.System && _systemDark); } }

        public static void Initialize(string stateDirectory)
        {
            _preferencesPath = Path.Combine(stateDirectory, "tray-settings.json");
            ThemeMode mode = ThemeMode.System;
            try
            {
                Dictionary<string, object> preferences = Json.AsObject(Json.Parse(File.ReadAllText(_preferencesPath)));
                string value = Json.Str(preferences, "theme");
                if (value == "light") mode = ThemeMode.Light;
                if (value == "dark") mode = ThemeMode.Dark;
            }
            catch { }
            Mode = mode;
            _systemDark = ReadSystemDark();
            RaiseChanged();
        }

        public static void SetMode(ThemeMode mode)
        {
            if (!Enum.IsDefined(typeof(ThemeMode), mode)) throw new ArgumentOutOfRangeException("mode");
            if (Mode == mode) return;
            if (!string.IsNullOrEmpty(_preferencesPath))
            {
                Directory.CreateDirectory(Path.GetDirectoryName(_preferencesPath));
                string temporary = _preferencesPath + "." + Guid.NewGuid().ToString("N") + ".tmp";
                try
                {
                    Dictionary<string, object> preferences = new Dictionary<string, object>();
                    preferences["version"] = 1;
                    preferences["theme"] = mode.ToString().ToLowerInvariant();
                    File.WriteAllText(temporary, Json.Serialize(preferences), new UTF8Encoding(false));
                    if (File.Exists(_preferencesPath)) File.Replace(temporary, _preferencesPath, null);
                    else File.Move(temporary, _preferencesPath);
                }
                finally { if (File.Exists(temporary)) File.Delete(temporary); }
            }
            Mode = mode;
            RaiseChanged();
        }

        public static void RefreshSystem()
        {
            bool dark = ReadSystemDark();
            if (dark == _systemDark) return;
            _systemDark = dark;
            if (Mode == ThemeMode.System) RaiseChanged();
        }

        private static void RaiseChanged()
        {
            EventHandler changed = Changed;
            if (changed != null) changed(null, EventArgs.Empty);
        }

        private static bool ReadSystemDark()
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"))
                {
                    object value = key == null ? null : key.GetValue("AppsUseLightTheme");
                    return !(value is int) || (int)value == 0;
                }
            }
            catch { return true; }
        }
    }
}
