# Bot Discord OTP

En production, le launcher compile utilise les fonctions Netlify. Le token Discord reste cote serveur et n'est jamais embarque dans le launcher. Le service Node de ce dossier est conserve pour le developpement local.

## Configuration Discord

1. Ouvrir le [Discord Developer Portal](https://discord.com/developers/applications).
2. Creer une application, puis ajouter un bot dans l'onglet **Bot**.
3. Copier l'Application ID dans `DISCORD_CLIENT_ID`.
4. Copier le token du bot uniquement dans une variable d'environnement serveur. Ne pas le committer ni l'envoyer dans le chat.
5. Inviter le bot sur le serveur avec les scopes `bot` et `applications.commands`, et la permission `Send Messages`.
6. Activer le mode developpeur Discord, puis copier les IDs du serveur et des admins.

## Netlify en production

1. Creer un site Netlify connecte au depot `Kylan-DevMc/BuildLauncher` et nommer le site `buildotpadmin`.
2. Netlify lit la configuration de `netlify.toml`; le site est volontairement vide visuellement. Le launcher appelle `https://buildotpadmin.netlify.app/otp/request` et `/otp/verify`.
3. Dans les variables d'environnement du site, avec la portee **Functions**, configurer :
   - `DISCORD_BOT_TOKEN` : token du bot Discord
   - `ADMIN_DISCORD_IDS` : IDs Discord des admins, separes par des virgules
   - `ADMIN_TRIGGER_PSEUDOS` : pseudos autorises, par defaut `kylanmc0001,matteo`
   - `OTP_PEPPER` : secret aleatoire d'au moins 32 caracteres
4. Redeployer le site apres avoir ajoute les variables.

Les fonctions Netlify envoient le code directement en DM Discord; le code n'est jamais renvoye au navigateur. Il expire apres 5 minutes, ne peut servir qu'une fois, et la verification est limitee a cinq essais. Les demandes sont limitees a une par pseudo par minute.

Generer une valeur aleatoire pour `OTP_PEPPER`, par exemple dans PowerShell :

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

Ne pas mettre ces secrets dans `netlify.toml`, dans le depot ou dans le code client.

## Developpement local

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

En mode developpement, `npm start` lance ce service local. La saisie d'un pseudo autorise demande un OTP au bot; un admin peut aussi demander un code avec `/otp` dans Discord. Le launcher compile ne demarre pas ce service local : il utilise les fonctions Netlify configurees ci-dessus.

Le service local utilise `POST /otp/request` et `POST /otp/verify`. Reponse de verification acceptee : `{ "ok": true, "role": "admin" }`.

## Test local

```powershell
cd bot-otp
Copy-Item .env.example .env
# Remplir .env avec les valeurs Discord et les IDs admin
npm start
```

Dans Discord, executer `/otp`, recevoir le message prive, puis saisir le code dans **Acces administrateur** dans le launcher de developpement.
