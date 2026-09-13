# Connecteur Power Query Sage X3 SOAP (POC)

Ce dossier contient une extension Power Query M qui appelle le web service SOAP
classique `CAdxWebServiceXmlCC` et le sous-programme de lecture `ZSOAPSQL` deja
utilise par le board.

Le connecteur est volontairement limite a la lecture : le SQL doit commencer par
`SELECT`. Il ne prend en charge ni `save`, ni `modify`, ni `delete`.

## Structure

```text
SageX3.pq         extension et authentification
SageX3.query.pq   requete de test du SDK
SageX3.proj       projet de packaging .mez
resources.resx    libelles du connecteur
README.md         installation et limites
```

## Prerequis X3

- Syracuse accessible depuis la machine qui execute Power Query ;
- pool SOAP actif, avec un alias correspondant a `PoolAlias` ;
- sous-programme `ZSOAPSQL` publie en GOSUB ;
- compte X3 de lecture seul ;
- HTTPS obligatoire : le connecteur refuse HTTP pour ne pas exposer Basic.

Le connecteur utilise l'endpoint de base, par exemple :

```text
https://serveur-x3:8124
```

Il ajoute automatiquement :

```text
/soap-generic/syracuse/collaboration/syracuse/CAdxWebServiceXmlCC
```

Le WSDL n'est pas l'URL d'execution.

## Installation du SDK

1. Installer Visual Studio Code et l'extension [Power Query Connector SDK](https://marketplace.visualstudio.com/items?itemName=PowerQuery.vscode-powerquery-sdk).
2. Ouvrir ce dossier comme workspace SDK. Le fichier `SageX3.proj` permet le
   packaging manuel de l'extension.
3. Utiliser les taches **Setup workspace**, **Build** et **Evaluate current file**
   du SDK. Le `.mez` est produit dans `bin/AnyCPU/Debug`.
4. Tester d'abord dans Power BI Desktop Windows. Copier le `.mez` dans :

   ```text
   [Documents]/Microsoft Power BI Desktop/Custom Connectors
   ```

5. En developpement uniquement, autoriser les extensions non certifiees dans
   **Fichier > Options et parametres > Options > Securite > Extensions de donnees**,
   puis redemarrer Power BI Desktop.

Le SDK Connector n'est pas disponible pour Visual Studio Code sur Mac Apple
Silicon. Le fichier M peut y etre edite et valide syntaxiquement, mais le build,
la gestion des credentials et l'evaluation du connecteur doivent etre faits sur
Windows pour ce POC.

Le fichier `.mez` n'inclut pas le mot de passe. Power Query affiche la fenetre
`UsernamePassword` et le code lit le credential a l'execution avec
`Extension.CurrentCredential()`.

## Appel depuis une requete M

Les parametres autres que l'endpoint sont optionnels pour que le credential soit
associe uniquement au serveur X3 :

```powerquery
let
    Endpoint = "https://serveur-x3:8124",
    PoolAlias = "X3TEST",
    Sql = "SELECT ITMREF || '|#|' || ITMDES1 FROM ITMMASTER",
    Columns = {"Article", "Designation"}
in
    SageX3.Contents(Endpoint, PoolAlias, Sql, Columns)
```

`ZSOAPSQL` retourne `W_RES` sous forme de lignes texte. Pour plusieurs colonnes,
le SQL doit donc retourner les valeurs separees par `|#|`, comme le client du
board (`app/x3/sql_builder.ts`).

## Ce que fait le POC

1. Construit le JSON `GRP1/W_SQL` attendu par `ZSOAPSQL`.
2. Construit l'enveloppe SOAP `run` avec `poolAlias` et `publicName=ZSOAPSQL`.
3. Envoie un POST avec l'identifiant Basic fourni par le gestionnaire Power Query.
4. Controle le statut HTTP, le statut X3, les fautes SOAP et `GRP4/W_ERR`.
5. Extrait `GRP2/W_RES` et le transforme en table Power Query.

Les parametres `requestConfig`, les groupes `GRP1` a `GRP4` et le format de sortie
sont alignes sur `app/x3/soap_client.ts`, `app/x3/response_parser.ts` et
`x3/subprograms/ZSOAPSQL.src`.

## Limites connues

- Le POC porte sur X3 on-premise avec Basic. X3 Online necessitera un flux OAuth2.
- Le SQL est volontairement borne a `SELECT`, mais il reste libre : n'utilisez
  qu'un compte X3 a droits de lecture.
- Le parsing repose sur le contrat JSON de `ZSOAPSQL`, pas sur une navigation
  generique du WSDL.
- Le POC ne declare pas encore `TestConnection` : le pool est optionnel dans la
  fonction et un rafraichissement via passerelle ne doit pas tester un pool fixe.
  Ce sera traite quand le pool fera partie de l'identite de la source.
- Le support des extensions personnalisees dans Excel pour Mac doit etre teste
  sur la version Office cible. Le POC est d'abord valide dans Power BI Desktop
  Windows.
- Le connecteur doit rester en lecture : Power Query peut reevaluer une requete
  et reessayer certains appels HTTP.

## Validation suivante

1. Remplacer l'endpoint fictif dans `SageX3.query.pq`.
2. Lancer une requete `SELECT 1 FROM DUAL` avec le compte de test.
3. Tester ensuite une ligne de `ITMMASTER` et verifier la table retournee.
4. Comparer une requete reelle avec le resultat du client TypeScript.
5. Tester le meme `.mez` dans l'hote Excel Mac vise avant toute integration du
   classeur `Reunion de charge`.

Sources Microsoft : [SDK](https://learn.microsoft.com/en-us/power-query/install-sdk),
[authentification](https://learn.microsoft.com/en-us/power-query/handling-authentication),
[Data Source Path](https://learn.microsoft.com/en-us/power-query/handling-resource-path).
