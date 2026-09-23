# Bot Discord OTP

Service separe du launcher. Le token Discord ne doit jamais etre place dans le launcher.

## Configuration Discord

1. Ouvrir le [Discord Developer Portal](https://discord.com/developers/applications).
2. Creer une application, puis ajouter un bot dans l'onglet **Bot**.
3. Copier l'Application ID dans `DISCORD_CLIENT_ID`.
4. Copier le token du bot uniquement dans `.env` local. Ne pas le committer ni l'envoyer dans le chat.
5. Inviter le bot sur le serveur avec les scopes `bot` et `applications.commands`, et la permission `Send Messages`.
6. Activer le mode developpeur Discord, puis copier les IDs du serveur et des admins.

## Installation

```powershell
cd bot-otp
npm install
Copy-Item .env.example .env
```

Remplir `.env` localement avec :

- `DISCORD_BOT_TOKEN` : token du bot
- `DISCORD_CLIENT_ID` : ID de l'application Discord
- `DISCORD_GUILD_ID` : ID du serveur Discord, optionnel mais recommande pour enregistrer la commande rapidement
- `ADMIN_DISCORD_IDS` : IDs Discord admin separes par des virgules
- `ADMIN_TRIGGER_PSEUDOS` : pseudos reserves qui ouvrent le panneau OTP, par exemple `admin`
- `OTP_PEPPER` : longue valeur aleatoire, differente du token
- `HOST` et `PORT` : adresse d'ecoute de l'API

Generer une valeur aleatoire pour `OTP_PEPPER`, par exemple avec PowerShell :

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

## Utilisation

```powershell
npm start
```

Un admin utilise `/otp` dans Discord. Le bot lui envoie un code prive de 6 chiffres, valable 5 minutes et utilisable une seule fois.

Le pseudo `admin` ouvre discretement le panneau OTP dans le login. Le launcher appelle `POST /otp/verify` avec `{ "pseudo": "admin", "code": "123456" }`. L'URL locale est definie dans `app/assets/js/adminotp.js`; pour la production, la remplacer par une URL HTTPS.

Reponse acceptee : `{ "ok": true, "role": "admin" }`.

## Test local

```powershell
cd bot-otp
Copy-Item .env.example .env
# Remplir .env avec les valeurs Discord et les IDs admin
npm start
```

Dans Discord, executer `/otp`, recevoir le message prive, puis saisir le code dans **Acces administrateur** dans le launcher.

Pour un launcher distant, ne pas exposer directement le port Node : placer l'API derriere HTTPS et un reverse proxy.
