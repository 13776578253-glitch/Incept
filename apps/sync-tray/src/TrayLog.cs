using System;
using System.IO;
using System.Text;

namespace InceptSync
{
    // Small append-only diagnostic log. Startup failures used to be invisible
    // because the tray is a windowless process launched by Explorer.
    internal static class TrayLog
    {
        public static void Write(string stateDirectory, string message)
        {
            try
            {
                if (string.IsNullOrEmpty(stateDirectory))
                {
                    return;
                }
                Directory.CreateDirectory(stateDirectory);
                string line = DateTime.UtcNow.ToString("o") + " " + message + Environment.NewLine;
                File.AppendAllText(Path.Combine(stateDirectory, "tray.log"), line, new UTF8Encoding(false));
            }
            catch
            {
            }
        }
    }
}
