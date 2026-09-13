// This file is executed by the Power Query SDK during local development.
// It intentionally contains no credentials.
let
    Endpoint = "https://x3.example.invalid:8124",
    PoolAlias = "X3TEST",
    Sql = "SELECT 1 FROM DUAL",
    Columns = {"W_RES"}
in
    SageX3.Contents(Endpoint, PoolAlias, Sql, Columns)
