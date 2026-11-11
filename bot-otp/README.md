# Bot Discord OTP

En production, le launcher utilise le site Netlify pour demander et verifier les codes OTP. Le token Discord reste cote serveur et n'est jamais integre au launcher.

## Flux du launcher

1. L'admin saisit son pseudo reserve dans le launcher.
2. Le launcher appelle `POST https://buildotpadmin.netlify.app/otp/request`.
3. Le site genere un code et l'envoie en message prive Discord aux comptes admin configures.
4. L'admin saisit le code a 6 chiffres dans le launcher.
5. Le launcher appelle `POST https://buildotpadmin.netlify.app/otp/verify`; le site verifie le code et accorde l'acces admin.

Le code expire apres 5 minutes, ne peut etre utilise qu'une fois et les demandes sont limitees. Les fonctions Netlify et Netlify Blobs doivent etre deployes pour que ce flux fonctionne.

## Configuration Netlify

Configurer ces variables dans les parametres du site :

- `DISCORD_BOT_TOKEN` : token du bot Discord
- `ADMIN_DISCORD_IDS` : IDs Discord des admins, separes par des virgules
- `ADMIN_TRIGGER_PSEUDOS` : pseudos autorises par le launcher, actuellement `kylanmc0001,matteo`
- `OTP_PEPPER` : valeur aleatoire secrete d'au moins 32 caracteres

Ne jamais placer ces secrets dans le launcher ni dans les fichiers publics du site. La connexion Google au tableau de bord Netlify sert uniquement a administrer/deployer le site; ce n'est pas la connexion OTP du launcher.

## Serveur local de developpement (optionnel)

Le serveur Node local peut etre utilise pour tester le bot independamment du launcher :

```powershell
cd bot-otp
npm install
Copy-Item .env.example .env
npm start
```

Le fichier `.env` local doit contenir `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `ADMIN_DISCORD_IDS`, `ADMIN_TRIGGER_PSEUDOS` et `OTP_PEPPER`. `DISCORD_GUILD_ID`, `HOST` et `PORT` sont optionnels. Ne pas committer ni partager `.env`, et ne pas exposer directement le serveur local sur Internet.
