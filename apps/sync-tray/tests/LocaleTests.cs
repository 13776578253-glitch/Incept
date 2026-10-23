using System;
using System.Globalization;
using System.IO;
using System.Reflection;

internal static class LocaleTests
{
    private const BindingFlags Flags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static;

    public static void Run(Assembly target, Action<string, Action> test)
    {
        Type locale = target.GetType("InceptSync.Locale", true);
        Type language = target.GetType("InceptSync.Language", true);
        Type strings = target.GetType("InceptSync.Strings", true);
        Type theme = target.GetType("InceptSync.ThemeManager", true);
        Type themeMode = target.GetType("InceptSync.ThemeMode", true);
        string directory = Path.Combine(Path.GetTempPath(), "InceptSync-locale-tests-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        Action initialize = delegate { locale.GetMethod("Initialize", Flags).Invoke(null, new object[] { directory }); };
        Action<string> select = delegate(string name) { locale.GetMethod("SetLanguage", Flags).Invoke(null, new object[] { Enum.Parse(language, name) }); };
        Func<string> current = delegate { return locale.GetProperty("Current", Flags).GetValue(null, null).ToString(); };
        Func<string, string> text = delegate(string property) { return (string)strings.GetProperty(property, Flags).GetValue(null, null); };
        string preference = Path.Combine(directory, "tray-settings.json");
        string expectedDefault = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "zh" ? "Zh" : "En";
        try
        {
            test("language defaults to the system culture and does not create preferences", delegate
            {
                initialize();
                Require(current() == expectedDefault, "unexpected default language: " + current());
                Require(!File.Exists(preference), "initialize must not create preferences");
            });
            test("language selection persists and reloads", delegate
            {
                // Selecting the value that already follows the system is a no-op,
                // so start from the opposite language to force a write.
                select(expectedDefault == "Zh" ? "En" : "Zh");
                initialize();
                foreach (string name in new string[] { "Zh", "En" })
                {
                    select(name);
                    initialize();
                    Require(current() == name, "selection not restored: " + name);
                    Require(File.ReadAllText(preference).Contains("\"" + (name == "En" ? "en" : "zh") + "\""), "missing persisted language");
                }
            });
            test("switching language keeps the saved theme and vice versa", delegate
            {
                select("Zh");
                theme.GetMethod("Initialize", Flags).Invoke(null, new object[] { directory });
                theme.GetMethod("SetMode", Flags).Invoke(null, new object[] { Enum.Parse(themeMode, "Light") });
                select("En");
                string saved = File.ReadAllText(preference);
                Require(saved.Contains("\"light\""), "theme was dropped when the language changed: " + saved);
                theme.GetMethod("SetMode", Flags).Invoke(null, new object[] { Enum.Parse(themeMode, "Dark") });
                saved = File.ReadAllText(preference);
                Require(saved.Contains("\"en\""), "language was dropped when the theme changed: " + saved);
            });
            test("strings resolve in the selected language", delegate
            {
                select("Zh");
                Require(text("SettingsTitle") == "设置", "unexpected Chinese title: " + text("SettingsTitle"));
                select("En");
                Require(text("SettingsTitle") == "Settings", "unexpected English title: " + text("SettingsTitle"));
                Require(text("RestartAgent").Length > 0 && text("SourcesLabel").Length > 0, "settings strings must not be empty");
            });
            test("unknown saved values fall back to the system default", delegate
            {
                File.WriteAllText(preference, "{\"version\":1,\"language\":\"klingon\"}");
                initialize();
                Require(current() == expectedDefault, "unknown language must fall back: " + current());
            });
        }
        finally
        {
            Directory.Delete(directory, true);
        }
    }

    private static void Require(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }
}
