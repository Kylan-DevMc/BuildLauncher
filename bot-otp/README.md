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

La saisie d'un pseudo reserve demande un OTP au bot; il envoie le code par DM aux comptes listes dans `ADMIN_DISCORD_IDS`. Le code expire apres 5 minutes, n'est utilisable qu'une fois et les demandes sont limitees a une par minute. Un admin peut aussi demander manuellement un code avec `/otp` dans Discord.

## Portail Netlify et contenu admin

Le launcher compile utilise `https://buildotpadmin.netlify.app` pour la connexion OTP. Le site Netlify doit avoir les fonctions de `netlify/functions` et le stockage Netlify Blobs active. Configurer dans Netlify :

- `DISCORD_BOT_TOKEN`
- `ADMIN_DISCORD_IDS`
- `ADMIN_TRIGGER_PSEUDOS`
- `OTP_PEPPER` (au moins 32 caracteres aleatoires)

Le portail d'administration se trouve a la racine du site Netlify. Apres verification OTP, les admins peuvent publier/supprimer des articles et gerer le catalogue de mods partage. Les nouveaux articles apparaissent a cote du flux RSS deja configure.

Pour les mods, renseigner une URL HTTPS directe vers un fichier `.jar` (Modrinth, CurseForge ou Netlify) et les IDs de mondes cibles; `*` cible tous les mondes. Le fichier du mod n'est pas envoye a une fonction Netlify : seule son URL et ses metadonnees y sont stockees. Le launcher telecharge le JAR, verifie son format et le SHA-512 si celui-ci est fourni.

Le service signe une session admin a courte duree a partir de `OTP_PEPPER`; les appels d'ecriture valident le jeton cote serveur. Ne jamais embarquer le token Discord dans le launcher ou dans le site public.

En developpement, le launcher peut continuer a utiliser le service local configure dans `bot-otp/.env`. Ce fichier ne doit pas etre partage ni commite.

## Test local

```powershell
cd bot-otp
Copy-Item .env.example .env
# Remplir .env avec les valeurs Discord et les IDs admin
npm start
```

Dans Discord, executer `/otp`, recevoir le message prive, puis saisir le code dans le launcher ou le portail Netlify.

Pour un launcher distant, ne pas exposer directement le port Node : placer l'API derriere HTTPS et un reverse proxy.
