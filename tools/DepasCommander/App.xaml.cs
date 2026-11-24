using System;
using System.IO;
using System.Windows;
using System.Windows.Threading;

namespace DepasCommander;

public partial class App : Application
{
    private static readonly string LogFile = @"C:\WEB REPORT\startup.log";

    public static void Log(string msg)
    {
        try
        {
            File.AppendAllText(LogFile, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] {msg}\r\n");
        }
        catch { }
    }

    protected override void OnStartup(StartupEventArgs e)
    {
        Log("=== App.OnStartup starting ===");

        AppDomain.CurrentDomain.UnhandledException += (s, args) =>
        {
            Log($"[CRITICAL] AppDomain Unhandled: {args.ExceptionObject}");
        };

        DispatcherUnhandledException += (s, args) =>
        {
            Log($"[CRITICAL] Dispatcher Unhandled: {args.Exception}");
            MessageBox.Show("Error saat membuka aplikasi:\n\n" + args.Exception.Message, "Error Startup", MessageBoxButton.OK, MessageBoxImage.Error);
            args.Handled = true;
        };

        base.OnStartup(e);
        Exit += (s, args) => Log($"App.Current.Exit called! ExitCode: {args.ApplicationExitCode}");
        Log("=== App.OnStartup base completed ===");
    }
}

