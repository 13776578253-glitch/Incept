using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;

namespace InceptSync
{
    internal enum AgentVisualState
    {
        Offline,
        Connected,
        Syncing,
        Paused,
        Attention
    }

    // Immutable-ish view of status.json written by the Node daemon. The tray
    // never opens state.db, so it cannot corrupt the outbox or credentials.
    internal sealed class StatusSnapshot
    {
        public const long StaleAfterMs = 15000;

        public bool Running;
        public bool Paused;
        public string Activity = "idle";
        public long AtMs;
        public long IntervalMs = 300000;
        public string LastCollectedAt;
        public string LastReportAt;
        public string LastSuccessfulSyncAt;
        public string LastErrorCode;
        public string LastErrorAt;
        public int PendingBatches;
        public int ReviewBatches;
        public int ConfirmedScopes;
        public bool RemoteOnline;

        public static StatusSnapshot Load(string stateDirectory)
        {
            try
            {
                string path = Path.Combine(stateDirectory, "status.json");
                if (!File.Exists(path))
                {
                    return null;
                }
                string text;
                using (FileStream stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                using (StreamReader reader = new StreamReader(stream))
                {
                    text = reader.ReadToEnd();
                }
                Dictionary<string, object> map = Json.AsObject(Json.Parse(text));
                StatusSnapshot snapshot = new StatusSnapshot();
                snapshot.Running = Json.Bool(map, "running");
                snapshot.Paused = Json.Bool(map, "paused");
                string activity = Json.Str(map, "activity");
                snapshot.Activity = string.IsNullOrEmpty(activity) ? "idle" : activity;
                snapshot.AtMs = (long)Json.Num(map, "at", 0);
                snapshot.IntervalMs = (long)Json.Num(map, "intervalMs", 300000);
                snapshot.LastCollectedAt = Json.Str(map, "lastCollectedAt");
                snapshot.LastReportAt = Json.Str(map, "lastReportAt");
                snapshot.LastSuccessfulSyncAt = Json.Str(map, "lastSuccessfulSyncAt");
                snapshot.LastErrorCode = Json.Str(map, "lastErrorCode");
                snapshot.LastErrorAt = Json.Str(map, "lastErrorAt");
                snapshot.ConfirmedScopes = (int)Json.Num(map, "confirmedScopes", 0);
                snapshot.RemoteOnline = Json.Bool(map, "remoteOnline");
                List<object> outbox = Json.Arr(map, "outbox");
                if (outbox != null)
                {
                    foreach (object item in outbox)
                    {
                        Dictionary<string, object> row = item as Dictionary<string, object>;
                        if (row == null)
                        {
                            continue;
                        }
                        int count = (int)Json.Num(row, "count", 0);
                        string state = Json.Str(row, "state");
                        if (state == "pending")
                        {
                            snapshot.PendingBatches += count;
                        }
                        else if (state == "review")
                        {
                            snapshot.ReviewBatches += count;
                        }
                    }
                }
                return snapshot;
            }
            catch
            {
                return null;
            }
        }

        public bool IsFresh(long nowMs)
        {
            return Running && AtMs > 0 && nowMs - AtMs <= StaleAfterMs;
        }

        public AgentVisualState VisualState(long nowMs)
        {
            if (!IsFresh(nowMs))
            {
                return AgentVisualState.Offline;
            }
            // A manual upload can run while automatic synchronization is paused.
            if (Activity == "uploading")
            {
                return AgentVisualState.Syncing;
            }
            if (Paused)
            {
                return AgentVisualState.Paused;
            }
            if (HasRecentError())
            {
                return AgentVisualState.Attention;
            }
            return AgentVisualState.Connected;
        }

        private bool HasRecentError()
        {
            if (string.IsNullOrEmpty(LastErrorCode))
            {
                return false;
            }
            DateTime errorAt = ParseTime(LastErrorAt);
            DateTime successAt = ParseTime(LastSuccessfulSyncAt);
            if (errorAt == DateTime.MinValue)
            {
                return false;
            }
            if (successAt != DateTime.MinValue && successAt >= errorAt)
            {
                return false;
            }
            return DateTime.UtcNow - errorAt.ToUniversalTime() < TimeSpan.FromMinutes(30);
        }

        public static DateTime ParseTime(string value)
        {
            DateTime parsed;
            if (!string.IsNullOrEmpty(value) && DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out parsed))
            {
                return parsed;
            }
            return DateTime.MinValue;
        }

        public string LastSyncText()
        {
            string stamp = LastSuccessfulSyncAt;
            if (string.IsNullOrEmpty(stamp))
            {
                stamp = LastReportAt;
            }
            if (string.IsNullOrEmpty(stamp))
            {
                stamp = LastCollectedAt;
            }
            return Relative(stamp);
        }

        public static string Relative(string iso)
        {
            DateTime at = ParseTime(iso);
            if (at == DateTime.MinValue)
            {
                return Strings.NoRecord;
            }
            TimeSpan span = DateTime.UtcNow - at.ToUniversalTime();
            if (span.TotalSeconds < 0)
            {
                span = TimeSpan.Zero;
            }
            if (span.TotalSeconds < 45)
            {
                return Strings.JustNow;
            }
            if (span.TotalMinutes < 60)
            {
                return string.Format(CultureInfo.InvariantCulture, Strings.MinutesAgo, Math.Max(1, (int)Math.Round(span.TotalMinutes)));
            }
            if (span.TotalHours < 24)
            {
                return string.Format(CultureInfo.InvariantCulture, Strings.HoursAgo, (int)span.TotalHours);
            }
            return string.Format(CultureInfo.InvariantCulture, Strings.DaysAgo, (int)span.TotalDays);
        }

        public string IntervalText()
        {
            long minutes = Math.Max(1, IntervalMs / 60000);
            return string.Format(CultureInfo.InvariantCulture, Strings.MinutesShort, minutes);
        }

        public string PendingText()
        {
            if (PendingBatches > 0)
            {
                return string.Format(CultureInfo.InvariantCulture, Strings.Batches, PendingBatches);
            }
            return Strings.None;
        }
    }
}
