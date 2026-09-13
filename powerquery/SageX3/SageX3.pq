section SageX3;

// The credential path is the endpoint only. Pool, SQL and columns are optional
// so changing a query does not create a second credential entry.
SageX3 = [
    Authentication = [
        UsernamePassword = [
            UsernameLabel = "X3 username",
            PasswordLabel = "X3 password"
        ]
    ],
    Label = Extension.LoadString("DataSourceLabel")
];

SageX3.Publish = [
    Beta = true,
    Category = "Other",
    ButtonText = { Extension.LoadString("FormulaTitle"), Extension.LoadString("FormulaHelp") }
];

[DataSource.Kind = "SageX3", Publish = "SageX3.Publish"]
shared SageX3.Contents =
    Value.ReplaceType(
        SageX3Impl,
        type function (
            endpoint as Uri.Type,
            optional poolAlias as text,
            optional sql as text,
            optional columns as list
        ) as table
    );

SageX3Impl = (
    endpoint as text,
    optional poolAlias as text,
    optional sql as text,
    optional columns as list
) as table =>
let
    Pool = if poolAlias = null or Text.Trim(poolAlias) = "" then "X3TEST" else poolAlias,
    SqlText = if sql = null or Text.Trim(sql) = "" then "SELECT 1 FROM DUAL" else sql,
    ColumnNames =
        if columns = null then
            {"W_RES"}
        else if List.Count(columns) = 0 then
            {"W_RES"}
        else
            List.Transform(columns, each Text.From(_)),

    // This connector deliberately exposes only read queries.
    ReadOnlyGuard =
        if not Text.StartsWith(Text.Upper(Text.Trim(SqlText)), "SELECT") then
            error Error.Record(
                "SageX3.ReadOnly",
                "Only SELECT statements are allowed by this POC.",
                [Sql = SqlText]
            )
        else
            true,

    EscapeXml = (value as text) as text =>
        Text.Replace(
            Text.Replace(
                Text.Replace(value, "&", "&amp;"),
                "<",
                "&lt;"
            ),
            ">",
            "&gt;"
        ),

    ToCData = (value as text) as text =>
        "<![CDATA[" & Text.Replace(value, "]]>", "]]]]><![CDATA[>") & "]]>",

    DecodeXml = (value as text) as text =>
        Text.Replace(
            Text.Replace(
                Text.Replace(
                    Text.Replace(
                        Text.Replace(value, "&lt;", "<"),
                        "&gt;",
                        ">"
                    ),
                    "&quot;",
                    """"
                ),
                "&apos;",
                "'"
            ),
            "&amp;",
            "&"
        ),

    // X3 returns resultXml as a text node, usually wrapped in CDATA. Keep the
    // CDATA content byte-for-byte: it is already the JSON returned by X3.
    ExtractElement = (xml as text, name as text) as nullable record =>
        let
            OpeningPosition = Text.PositionOf(xml, "<" & name),
            OpeningEnd =
                if OpeningPosition < 0 then
                    -1
                else
                    Text.PositionOf(Text.Range(xml, OpeningPosition), ">"),
            ContentStart =
                if OpeningEnd < 0 then
                    -1
                else
                    OpeningPosition + OpeningEnd + 1,
            ClosingPosition =
                if ContentStart < 0 then
                    -1
                else
                    Text.PositionOf(Text.Range(xml, ContentStart), "</" & name & ">"),
            Content =
                if ContentStart < 0 or ClosingPosition < 0 then
                    null
                else
                    Text.Range(xml, ContentStart, ClosingPosition),
            Trimmed = if Content = null then null else Text.Trim(Content),
            IsCData = if Trimmed = null then false else Text.StartsWith(Trimmed, "<![CDATA["),
            WithoutCData =
                if Trimmed = null then
                    null
                else if IsCData then
                    Text.BetweenDelimiters(Trimmed, "<![CDATA[", "]]>")
                else
                    Trimmed
        in
            if WithoutCData = null then
                null
            else
                [
                    Value = if IsCData then WithoutCData else DecodeXml(WithoutCData),
                    IsCData = IsCData
                ],

    InputJson =
        if ReadOnlyGuard then
            Text.FromBinary(
                Json.FromValue([GRP1 = [W_SQL = SqlText]]),
                TextEncoding.Utf8
            )
        else
            null,
    Envelope =
        Text.Combine(
            {
                "<?xml version=""1.0"" encoding=""utf-8""?>",
                "<soapenv:Envelope xmlns:soapenv=""http://schemas.xmlsoap.org/soap/envelope/"" xmlns:wss=""http://www.adonix.com/WSS"" xmlns:xsd=""http://www.w3.org/2001/XMLSchema"" xmlns:xsi=""http://www.w3.org/2001/XMLSchema-instance"" xmlns:soapenc=""http://schemas.xmlsoap.org/soap/encoding/"">",
                "<soapenv:Header/>",
                "<soapenv:Body>",
                "<wss:run soapenv:encodingStyle=""http://schemas.xmlsoap.org/soap/encoding/"">",
                "<callContext xsi:type=""wss:CAdxCallContext"">",
                "<codeLang xsi:type=""xsd:string"">FRA</codeLang>",
                "<poolAlias xsi:type=""xsd:string"">" & EscapeXml(Pool) & "</poolAlias>",
                "<poolId xsi:type=""xsd:string""></poolId>",
                "<requestConfig xsi:type=""xsd:string"">adxwss.optreturn=JSON&amp;adxwss.beautify=true</requestConfig>",
                "</callContext>",
                "<publicName xsi:type=""xsd:string"">ZSOAPSQL</publicName>",
                "<inputXml xsi:type=""xsd:string"">" & ToCData(InputJson) & "</inputXml>",
                "</wss:run>",
                "</soapenv:Body>",
                "</soapenv:Envelope>"
            },
            "#(lf)"
        ),
    Credential = Extension.CurrentCredential(),
    Username = Record.FieldOrDefault(Credential, "Username", ""),
    Password = Record.FieldOrDefault(Credential, "Password", ""),
    CredentialGuard =
        if Username = "" or Password = "" then
            error Error.Record(
                "SageX3.Credentials",
                "UsernamePassword credentials are required.",
                []
            )
        else
            true,
    Authorization =
        if CredentialGuard then
            "Basic "
                & Binary.ToText(
                    Text.ToBinary(Username & ":" & Password, TextEncoding.Utf8),
                    BinaryEncoding.Base64
                )
        else
            null,
    EndpointScheme =
        Text.Lower(Record.FieldOrDefault(Uri.Parts(endpoint), "Scheme", "")),
    HttpsGuard =
        if EndpointScheme <> "https" then
            error Error.Record(
                "SageX3.Transport",
                "The Sage X3 endpoint must use HTTPS.",
                [Scheme = EndpointScheme]
            )
        else
            true,
    Raw =
        if CredentialGuard and HttpsGuard then
            Web.Contents(
                endpoint,
                [
                    RelativePath = "soap-generic/syracuse/collaboration/syracuse/CAdxWebServiceXmlCC",
                    Headers = [
                        Authorization = Authorization,
                        Accept = "text/xml",
                        #"Content-Type" = "text/xml; charset=utf-8",
                        #"SOAPAction" = ""
                    ],
                    Content = Text.ToBinary(Envelope, TextEncoding.Utf8),
                    ManualCredentials = true,
                    ManualStatusHandling = {400, 401, 403, 500, 502, 503, 504},
                    Timeout = #duration(0, 0, 2, 0)
                ]
            )
        else
            null,
    ResponseMetadata = Value.Metadata(Raw),
    HttpStatus = Record.FieldOrDefault(ResponseMetadata, "Response.Status", 200),
    ResponseText = Text.FromBinary(Raw, TextEncoding.Utf8),
    ResultStart = Text.PositionOf(ResponseText, "<resultXml"),
    ResultClose = Text.PositionOf(ResponseText, "</resultXml>"),
    ResultSelfClose =
        if ResultStart < 0 then
            -1
        else
            Text.PositionOf(Text.Range(ResponseText, ResultStart), "/>"),
    SoapOuterText =
        if ResultStart < 0 then
            ResponseText
        else if ResultClose >= 0 then
            Text.BeforeDelimiter(ResponseText, "<resultXml")
                & Text.AfterDelimiter(ResponseText, "</resultXml>")
        else if ResultSelfClose >= 0 then
            Text.BeforeDelimiter(ResponseText, "<resultXml")
                & Text.AfterDelimiter(Text.Range(ResponseText, ResultStart), "/>" )
        else
            Text.BeforeDelimiter(ResponseText, "<resultXml"),
    FaultElement = ExtractElement(SoapOuterText, "faultstring"),
    Fault = if FaultElement = null then null else FaultElement[Value],
    FaultGuard =
        if Fault <> null and Text.Trim(Fault) <> "" then
            error Error.Record("SageX3.SoapFault", Fault, [])
        else
            true,
    HttpGuard =
        if FaultGuard then
            if HttpStatus < 200 or HttpStatus >= 300 then
                error Error.Record(
                    "SageX3.Http",
                    "Sage X3 returned HTTP " & Text.From(HttpStatus) & ".",
                    [Status = HttpStatus]
                )
            else
                true
        else
            true,
    StatusElement = if FaultGuard and HttpGuard then ExtractElement(SoapOuterText, "status") else null,
    StatusText = if StatusElement = null then null else StatusElement[Value],
    X3Status =
        try Number.FromText(Text.Trim(if StatusText = null then "" else StatusText))
        otherwise null,
    StatusGuard =
        if X3Status <> 1 then
            error Error.Record(
                "SageX3.Status",
                "Sage X3 returned a non-success status.",
                [Status = X3Status]
            )
        else
            true,
    ResultElement = if StatusGuard then ExtractElement(ResponseText, "resultXml") else null,
    ResultXml = if ResultElement = null then null else ResultElement[Value],
    ResultGuard =
        if ResultXml = null or Text.Trim(ResultXml) = "" then
            error Error.Record(
                "SageX3.Response",
                "Sage X3 returned no resultXml.",
                [Status = X3Status]
            )
        else
            true,
    ResultJson =
        if ResultGuard then
            Json.Document(Text.ToBinary(ResultXml, TextEncoding.Utf8))
        else
            null,
    ResultGroup =
        if Value.Is(ResultJson, type record) then
            Record.FieldOrDefault(ResultJson, "GRP2", null)
        else
            null,
    ErrorGroup =
        if Value.Is(ResultJson, type record) then
            Record.FieldOrDefault(ResultJson, "GRP4", null)
        else
            null,
    X3Error =
        if Value.Is(ErrorGroup, type record) then
            Text.From(Record.FieldOrDefault(ErrorGroup, "W_ERR", ""))
        else
            "",
    X3ErrorGuard =
        if Text.Trim(X3Error) <> "" then
            error Error.Record("SageX3.Business", X3Error, [])
        else
            true,
    SplitLines = (value as text) as list =>
        if Text.Trim(value) = "" then
            {}
        else
            List.Select(
                List.Transform(
                    Text.Split(Text.Replace(value, "#(cr)", ""), "#(lf)"),
                    each Text.Trim(_)
                ),
                each _ <> ""
            ),
    LinesFromValue = (value as any) as list =>
        if Value.Is(value, type text) then
            SplitLines(value)
        else if Value.Is(value, type list) then
            List.Combine(
                List.Transform(
                    value,
                    each
                        if Value.Is(_, type record) then
                            SplitLines(Text.From(Record.FieldOrDefault(_, "W_RES", "")))
                        else
                            {Text.From(_) }
                )
            )
        else
            {},
    RawLines =
        if Value.Is(ResultGroup, type record) then
            LinesFromValue(Record.FieldOrDefault(ResultGroup, "W_RES", null))
        else if Value.Is(ResultGroup, type list) then
            LinesFromValue(ResultGroup)
        else
            {},
    RowForLine = (line as text) as list =>
        let
            Parts =
                if List.Count(ColumnNames) = 1 then
                    {line}
                else
                    List.Transform(Text.Split(line, "|#|"), each Text.Trim(_)),
            Padded = List.FirstN(
                List.Combine({Parts, List.Repeat({null}, List.Count(ColumnNames))}),
                List.Count(ColumnNames)
            )
        in
            Padded,
    Output =
        if X3ErrorGuard then
            #table(ColumnNames, List.Transform(RawLines, each RowForLine(_)))
        else
            #table(ColumnNames, {})
in
    Output;
