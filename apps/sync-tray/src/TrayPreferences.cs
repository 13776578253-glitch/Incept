using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace InceptSync
{
    // Single owner of tray-settings.json. Theme, language and any future flag
    // are merged into one document so saving one setting cannot erase another.
    internal static class TrayPreferences
    {
        private static string _path;

        public static string FilePath
        {
            get { return _path; }
        }

        public static void Initialize(string stateDirectory)
        {
            _path = System.IO.Path.Combine(stateDirectory, "tray-settings.json");
        }

        // Returns null when no preference has ever been written.
        public static string Get(string key)
        {
            Dictionary<string, object> values = Read();
            return values == null ? null : Json.Str(values, key);
        }

        public static void Set(string key, string value)
        {
            if (string.IsNullOrEmpty(_path))
            {
                throw new InvalidOperationException("Preferences are not initialized.");
            }
            Dictionary<string, object> values = Read();
            if (values == null)
            {
                values = new Dictionary<string, object>();
            }
            values["version"] = 1;
            values[key] = value;
            Write(values);
        }

        private static Dictionary<string, object> Read()
        {
            if (string.IsNullOrEmpty(_path) || !File.Exists(_path))
            {
                return null;
            }
            try
            {
                return Json.AsObject(Json.Parse(File.ReadAllText(_path)));
            }
            catch
            {
                return null;
            }
        }

        private static void Write(Dictionary<string, object> values)
        {
            string directory = System.IO.Path.GetDirectoryName(_path);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }
            string temporary = _path + "." + Guid.NewGuid().ToString("N") + ".tmp";
            try
            {
                File.WriteAllText(temporary, Json.Serialize(values), new UTF8Encoding(false));
                if (File.Exists(_path))
                {
                    File.Replace(temporary, _path, null);
                }
                else
                {
                    File.Move(temporary, _path);
                }
            }
            finally
            {
                if (File.Exists(temporary))
                {
                    File.Delete(temporary);
                }
            }
        }
    }
}
