using System;
using Microsoft.Win32;

namespace InceptSync
{
    internal enum ThemeMode { System, Light, Dark }

    internal static class ThemeManager
    {
        private static bool _systemDark = ReadSystemDark();
        public static ThemeMode Mode { get; private set; }
        public static event EventHandler Changed;
        public static bool IsDark { get { return Mode == ThemeMode.Dark || (Mode == ThemeMode.System && _systemDark); } }

        public static void Initialize(string stateDirectory)
        {
            // Shared document with the language setting; reading never writes.
            TrayPreferences.Initialize(stateDirectory);
            ThemeMode mode = ThemeMode.System;
            string value = TrayPreferences.Get("theme");
            if (value == "light") mode = ThemeMode.Light;
            if (value == "dark") mode = ThemeMode.Dark;
            Mode = mode;
            _systemDark = ReadSystemDark();
            RaiseChanged();
        }

        public static void SetMode(ThemeMode mode)
        {
            if (!Enum.IsDefined(typeof(ThemeMode), mode)) throw new ArgumentOutOfRangeException("mode");
            if (Mode == mode) return;
            TrayPreferences.Set("theme", mode.ToString().ToLowerInvariant());
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
