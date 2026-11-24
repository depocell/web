using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Win32;
using Wpf.Ui.Appearance;
using Wpf.Ui.Controls;
using MessageBoxButton = System.Windows.MessageBoxButton;
using MessageBoxResult = System.Windows.MessageBoxResult;
using MessageBoxImage = System.Windows.MessageBoxImage;
using MessageBox = System.Windows.MessageBox;

namespace DepasCommander;

public partial class MainWindow : FluentWindow
{
    private readonly HttpClient _httpClient = new HttpClient { Timeout = TimeSpan.FromMinutes(10) };
    private string _selectedTsvPath = string.Empty;
    private string _activeBrand = "ASTAGA";
    private bool _isDarkMode = true;

    private const string BaseApiUrl = "http://127.0.0.1:8000";
    private const string RawDataDir = @"C:\DMS RAW DATA";
    private const string CacheDir = @"C:\WEB REPORT\.cache";

    public MainWindow()
    {
        App.Log("MainWindow constructor start");
        InitializeComponent();
        App.Log("MainWindow InitializeComponent done");
        Loaded += MainWindow_Loaded;
        Closing += (s, e) => App.Log($"MainWindow Closing event fired! Cancel: {e.Cancel}");
        Closed += (s, e) => App.Log("MainWindow Closed event fired!");
        App.Log("MainWindow constructor completed");
    }

    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        App.Log("MainWindow_Loaded start");
        try
        {
            // Set tema awal Dark Mode
            ApplicationThemeManager.Apply(ApplicationTheme.Dark);
            App.Log("MainWindow_Loaded ApplicationTheme.Dark applied");

            // Update status telemetri awal
            await RefreshLocalStatusAsync();
            App.Log("MainWindow_Loaded RefreshLocalStatusAsync done");

            // Cari otomatis file TSV default jika ada di folder C:\DMS RAW DATA
            AutoDetectDefaultTsv();
            App.Log("MainWindow_Loaded AutoDetectDefaultTsv done");
        }
        catch (Exception ex)
        {
            App.Log("MainWindow_Loaded EXCEPTION: " + ex);
        }
    }

    private void AutoDetectDefaultTsv()
    {
        try
        {
            string defaultPath = Path.Combine(RawDataDir, _activeBrand.ToLower() + ".tsv");
            if (File.Exists(defaultPath))
            {
                SetSelectedFile(defaultPath);
            }
        }
        catch
        {
            // Ignore
        }
    }

    private void SetSelectedFile(string path)
    {
        _selectedTsvPath = path;
        FileInfo fi = new FileInfo(path);
        TxtSelectedFile.Text = $"File: {fi.Name}";
        TxtSelectedFileSize.Text = $"Ukuran: {fi.Length / 1024.0 / 1024.0:F2} MB | Diperbarui: {fi.LastWriteTime:yyyy-MM-dd HH:mm:ss}";
        BtnProcessTsv.IsEnabled = true;

        // Auto pilih radio button sesuai nama file
        if (fi.Name.ToLower().Contains("okipay"))
        {
            RbOkipay.IsChecked = true;
            _activeBrand = "OKIPAY";
        }
        else if (fi.Name.ToLower().Contains("astaga"))
        {
            RbAstaga.IsChecked = true;
            _activeBrand = "ASTAGA";
        }
    }

    private void BtnThemeToggle_Click(object sender, RoutedEventArgs e)
    {
        _isDarkMode = !_isDarkMode;
        ApplicationTheme newTheme = _isDarkMode ? ApplicationTheme.Dark : ApplicationTheme.Light;
        ApplicationThemeManager.Apply(newTheme);
        BtnThemeToggle.Icon = new SymbolIcon(_isDarkMode ? SymbolRegular.WeatherMoon24 : SymbolRegular.WeatherSunny24);
    }

    private void RootNavigation_SelectionChanged(NavigationView sender, RoutedEventArgs args)
    {
        if (sender.SelectedItem is NavigationViewItem selectedItem)
        {
            string tag = selectedItem.TargetPageTag ?? string.Empty;
            if (tag == "exit")
            {
                Close();
                return;
            }

            ViewTsv.Visibility = tag == "tsv" ? Visibility.Visible : Visibility.Collapsed;
            ViewSync.Visibility = tag == "sync" ? Visibility.Visible : Visibility.Collapsed;
            ViewStatus.Visibility = tag == "status" ? Visibility.Visible : Visibility.Collapsed;
            ViewWebReport.Visibility = tag == "webreport" ? Visibility.Visible : Visibility.Collapsed;

            if (tag == "webreport")
            {
                InitWebView();
            }
            else if (tag == "status")
            {
                _ = RefreshLocalStatusAsync();
            }
        }
    }

    private async void InitWebView()
    {
        try
        {
            if (ReportWebView.CoreWebView2 == null)
            {
                await ReportWebView.EnsureCoreWebView2Async();
                ReportWebView.Source = new Uri($"{BaseApiUrl}/?mode=admin#admin");
            }
        }
        catch (Exception ex)
        {
            System.Windows.MessageBox.Show("Gagal memuat WebView2: " + ex.Message, "Error", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }

    private void BtnRefreshWeb_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            ReportWebView.Reload();
        }
        catch
        {
            // Ignore
        }
    }

    // ── OLAH DATA TSV HANDLERS ──────────────────────────────────────────────

    private void RbBrand_Checked(object sender, RoutedEventArgs e)
    {
        _activeBrand = RbAstaga.IsChecked == true ? "ASTAGA" : "OKIPAY";
    }

    private void DropZone_DragOver(object sender, DragEventArgs e)
    {
        if (e.Data.GetDataPresent(DataFormats.FileDrop))
        {
            e.Effects = DragDropEffects.Copy;
        }
        else
        {
            e.Effects = DragDropEffects.None;
        }
        e.Handled = true;
    }

    private void DropZone_Drop(object sender, DragEventArgs e)
    {
        if (e.Data.GetDataPresent(DataFormats.FileDrop))
        {
            string[] files = (string[])e.Data.GetData(DataFormats.FileDrop);
            if (files != null && files.Length > 0)
            {
                string firstFile = files[0];
                if (firstFile.EndsWith(".tsv", StringComparison.OrdinalIgnoreCase) ||
                    firstFile.EndsWith(".txt", StringComparison.OrdinalIgnoreCase))
                {
                    SetSelectedFile(firstFile);
                }
                else
                {
                    System.Windows.MessageBox.Show("Silakan masukkan file berekstensi .tsv (OtomaX).", "File Tidak Valid", MessageBoxButton.OK, MessageBoxImage.Warning);
                }
            }
        }
    }

    private void BtnBrowseFile_Click(object sender, RoutedEventArgs e)
    {
        OpenFileDialog dlg = new OpenFileDialog
        {
            Filter = "File TSV OtomaX (*.tsv;*.txt)|*.tsv;*.txt|Semua File (*.*)|*.*",
            InitialDirectory = Directory.Exists(RawDataDir) ? RawDataDir : "C:\\"
        };

        if (dlg.ShowDialog() == true)
        {
            SetSelectedFile(dlg.FileName);
        }
    }

    private async void BtnProcessTsv_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrEmpty(_selectedTsvPath) || !File.Exists(_selectedTsvPath))
        {
            System.Windows.MessageBox.Show("Pilih file TSV terlebih dahulu.", "Peringatan", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        BtnProcessTsv.IsEnabled = false;
        BtnBrowseFile.IsEnabled = false;
        TxtTsvLog.Text = $"[{DateTime.Now:HH:mm:ss}] Mengirim {_selectedTsvPath} ({_activeBrand}) ke engine ingestion...\n";

        try
        {
            using var form = new MultipartFormDataContent();
            form.Add(new StringContent(_activeBrand), "brand");

            using var fileStream = File.OpenRead(_selectedTsvPath);
            using var fileContent = new StreamContent(fileStream);
            fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("text/tab-separated-values");
            form.Add(fileContent, "file", Path.GetFileName(_selectedTsvPath));

            var response = await _httpClient.PostAsync($"{BaseApiUrl}/api/admin/upload-tsv", form);
            string resultJson = await response.Content.ReadAsStringAsync();

            if (response.IsSuccessStatusCode)
            {
                TxtTsvLog.Text += $"[{DateTime.Now:HH:mm:ss}] INGESTION SUKSES!\n{resultJson}\n";
                System.Windows.MessageBox.Show("Ingestion data TSV ke Parquet selesai dengan sukses!", "Berhasil", MessageBoxButton.OK, MessageBoxImage.Information);
                await RefreshLocalStatusAsync();
            }
            else
            {
                TxtTsvLog.Text += $"[{DateTime.Now:HH:mm:ss}] GAGAL: {resultJson}\n";
                System.Windows.MessageBox.Show("Ingestion gagal:\n" + resultJson, "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            TxtTsvLog.Text += $"[{DateTime.Now:HH:mm:ss}] ERROR KONEKSI: {ex.Message}\n";
            System.Windows.MessageBox.Show("Terjadi error koneksi ke server lokal:\n" + ex.Message, "Koneksi Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            BtnProcessTsv.IsEnabled = true;
            BtnBrowseFile.IsEnabled = true;
        }
    }

    // ── SYNC CLOUD VPS HANDLERS ─────────────────────────────────────────────

    private async void BtnCheckVps_Click(object sender, RoutedEventArgs e)
    {
        TxtVpsStatus.Text = "Memeriksa status telemetri VPS...";
        try
        {
            var res = await _httpClient.GetStringAsync($"{BaseApiUrl}/api/admin/vps-status");
            using var doc = JsonDocument.Parse(res);
            if (doc.RootElement.TryGetProperty("ok", out var okProp) && okProp.GetBoolean())
            {
                string uptime = doc.RootElement.TryGetProperty("uptime", out var up) ? (up.GetString() ?? "Online") : "Online";
                TxtVpsStatus.Text = $"VPS ONLINE (185.205.222.170) | Uptime: {uptime}";
            }
            else
            {
                TxtVpsStatus.Text = "VPS tidak merespons telemetri.";
            }
        }
        catch (Exception ex)
        {
            TxtVpsStatus.Text = "Gagal menghubungi backend: " + ex.Message;
        }
    }

    private async void BtnStartSync_Click(object sender, RoutedEventArgs e)
    {
        if (System.Windows.MessageBox.Show("Sinkronkan database master dan file Parquet terbaru ke VPS depas.my.id sekarang?", "Konfirmasi Sinkronisasi", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes)
        {
            return;
        }

        BtnStartSync.IsEnabled = false;
        TxtSyncLog.Text = $"[{DateTime.Now:HH:mm:ss}] Memulai koneksi streaming SFTP ke VPS...\n";

        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, $"{BaseApiUrl}/api/admin/sync-vps-stream");
            using var response = await _httpClient.SendAsync(req, HttpCompletionOption.ResponseHeadersRead);

            using var stream = await response.Content.ReadAsStreamAsync();
            using var reader = new StreamReader(stream);

            while (!reader.EndOfStream)
            {
                string? line = await reader.ReadLineAsync();
                if (string.IsNullOrWhiteSpace(line)) continue;

                if (line.StartsWith("data:"))
                {
                    string jsonStr = line.Substring(5).Trim();
                    try
                    {
                        using var doc = JsonDocument.Parse(jsonStr);
                        var root = doc.RootElement;
                        string msg = (root.TryGetProperty("message", out var m) ? m.GetString() : null) ?? jsonStr;
                        string type = (root.TryGetProperty("type", out var t) ? t.GetString() : null) ?? "";

                        TxtSyncLog.Text += $"[{DateTime.Now:HH:mm:ss}] {msg}\n";
                        TxtSyncLog.ScrollToEnd();

                        if (type == "done")
                        {
                            System.Windows.MessageBox.Show("Sinkronisasi ke VPS depas.my.id BERHASIL!\nWebsite publik sudah live dengan data terbaru.", "Sukses", MessageBoxButton.OK, MessageBoxImage.Information);
                        }
                    }
                    catch
                    {
                        TxtSyncLog.Text += line + "\n";
                    }
                }
            }
        }
        catch (Exception ex)
        {
            TxtSyncLog.Text += $"[{DateTime.Now:HH:mm:ss}] ERROR SINKRONISASI: {ex.Message}\n";
            System.Windows.MessageBox.Show("Error saat sinkronisasi: " + ex.Message, "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            BtnStartSync.IsEnabled = true;
        }
    }

    // ── TELEMETRI & STATUS HANDLERS ─────────────────────────────────────────

    private async Task RefreshLocalStatusAsync()
    {
        // 1. Cek Server Port 8000
        try
        {
            var res = await _httpClient.GetAsync($"{BaseApiUrl}/api/system/pulse");
            if (res.IsSuccessStatusCode)
            {
                TxtLocalServerStatus.Text = "Status: ONLINE (Port 8000 Aktif)";
            }
            else
            {
                TxtLocalServerStatus.Text = "Status: Server Port 8000 merespons status non-200";
            }
        }
        catch
        {
            TxtLocalServerStatus.Text = "Status: OFFLINE (Backend server belum dinyalakan)";
        }

        // 2. Cek Parquet Files
        try
        {
            if (Directory.Exists(CacheDir))
            {
                string[] files = Directory.GetFiles(CacheDir, "*2026*.parquet");
                string info = $"Ditemukan {files.Length} file Parquet transaksi tahun 2026:\n";
                foreach (var f in files)
                {
                    FileInfo fi = new FileInfo(f);
                    info += $"  • {fi.Name} ({fi.Length / 1024.0 / 1024.0:F2} MB, update: {fi.LastWriteTime:yyyy-MM-dd HH:mm})\n";
                }
                TxtParquetInfo.Text = info;
            }
            else
            {
                TxtParquetInfo.Text = "Direktori .cache/ belum ditemukan.";
            }
        }
        catch (Exception ex)
        {
            TxtParquetInfo.Text = "Gagal memindai cache: " + ex.Message;
        }
    }

    private void BtnOpenBrowser_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            Process.Start(new ProcessStartInfo("http://localhost:8000") { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            System.Windows.MessageBox.Show("Gagal membuka browser: " + ex.Message);
        }
    }

    private void BtnOpenRawData_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            if (Directory.Exists(RawDataDir))
            {
                Process.Start("explorer.exe", RawDataDir);
            }
            else
            {
                System.Windows.MessageBox.Show($"Folder {RawDataDir} tidak ditemukan.");
            }
        }
        catch (Exception ex)
        {
            System.Windows.MessageBox.Show("Gagal membuka folder: " + ex.Message);
        }
    }
}
