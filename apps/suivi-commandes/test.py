import os

import requests

URL = "http://srv-x3web-01-fr:8124/soap-generic/syracuse/collaboration/syracuse/CAdxWebServiceXmlCC"
USER = os.environ.get("X3_USER")
PASSWORD = os.environ.get("X3_PASSWORD")

if not USER or not PASSWORD:
    raise RuntimeError("Set X3_USER and X3_PASSWORD before running this script.")

payload = """<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:wss="http://www.adonix.com/WSS">
  <soapenv:Header/>
  <soapenv:Body>
    <wss:query>
      <callContext>
        <codeLang>FRA</codeLang>
        <poolAlias>CLTEST</poolAlias>
        <requestConfig>adxwss.trace.on=off</requestConfig>
      </callContext>
      <publicName>ITMMASTER</publicName>
      <variant></variant>
      <listSize>10</listSize>
      <indexName>ITM0</indexName>
      <keyFields></keyFields>
      <fieldNames>ITMREF,ITMDES1</fieldNames>
      <criteria></criteria>
    </wss:query>
  </soapenv:Body>
</soapenv:Envelope>"""

response = requests.post(
    URL,
    data=payload.encode("utf-8"),
    auth=(USER, PASSWORD),
    headers={"Content-Type": "text/xml;charset=UTF-8"}
)

print(response.status_code)
print(response.text)
