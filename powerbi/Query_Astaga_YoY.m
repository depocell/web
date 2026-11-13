let
    // SUNTIKAN POWER QUERY (M) - WEB REPORT ASTAGA YOY
    // Membaca langsung columnar Parquet hasil olahan Dapur Python
    Source = Parquet.Document(File.Contents("C:\WEB REPORT\powerbi\dataset_yoy_astaga.parquet")),
    #"Changed Type" = Table.TransformColumnTypes(Source,{
        {"trx_id", Int64.Type}, 
        {"tgl_entry", type datetime}, 
        {"Tanggal", type date}, 
        {"Bulan_Tahun", type text}, 
        {"Nama_Bulan", type text}, 
        {"Bulan_Urut", Int64.Type}, 
        {"Tahun", Int64.Type}, 
        {"ar_id", type text},
        {"reseller_name", type text},
        {"agen_name", type text},
        {"cabang", type text}, 
        {"tipe", type text}, 
        {"product_id", type text},
        {"product_name", type text},
        {"kategori", type text}, 
        {"operator", type text}, 
        {"status", type text},
        {"beli", Currency.Type}, 
        {"jual", Currency.Type}
    })
in
    #"Changed Type"
