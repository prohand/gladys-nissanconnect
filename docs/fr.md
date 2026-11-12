# Nissan Connect

Cette intégration amène votre **voiture électrique Nissan** dans Gladys via le cloud
**NissanConnect Services** — le même service que l’application mobile Nissan. Vous voyez la
batterie, l’autonomie, la charge et la climatisation, vous pouvez lancer la clim ou la
charge, et utiliser tout cela dans les scènes et sur le tableau de bord.

## Avant de commencer

- **Gladys 5.3 ou plus récent.**
- Un compte **NissanConnect Services** (Europe), avec votre voiture **activée dans
  l’application mobile**. Si l’application affiche votre voiture et sa batterie, cette
  intégration le peut aussi.
- L’intégration passe **uniquement par le cloud Nissan** : elle ne parle jamais à la voiture
  sur votre réseau local, et elle a besoin d’un accès à internet.

> Nissan ne propose pas d’API publique. L’intégration parle le même langage que
> l’application officielle, que Nissan peut changer sans prévenir. Tous les modèles ne
> répondent pas à toutes les demandes : une LEAF, par exemple, ne donne pas l’état du
> verrouillage des portes.

## Configuration

Ouvrez **Intégrations → Nissan Connect → Configuration**.

| Champ                                        | Ce qu’il faut mettre                                                                                                                                                                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Identifiant NissanConnect (e-mail)**       | L’e-mail avec lequel vous vous connectez à l’application NissanConnect Services.                                                                                                                                                                 |
| **Mot de passe NissanConnect**               | Son mot de passe. Gladys le garde comme un secret ; il n’est jamais écrit dans les journaux.                                                                                                                                                     |
| **Intervalle de rafraîchissement (s)**       | Fréquence à laquelle Gladys lit ce que la voiture a envoyé en dernier au cloud Nissan. Par défaut 900 (15 min), minimum 300. Cela ne réveille **pas** la voiture.                                                                                |
| **Intervalle de réveil de la voiture (min)** | Fréquence à laquelle on demande à la voiture elle-même d’envoyer des données fraîches. Par défaut **0 = seulement à la demande**. Chaque réveil puise dans la batterie 12 V : si vous l’activez, choisissez une grande valeur (par exemple 240). |
| **Unité de distance**                        | Kilomètres ou miles, pour l’autonomie et le compteur.                                                                                                                                                                                            |
| **Température de la clim (°C)**              | Température de l’habitacle utilisée quand la clim est lancée sans en préciser une (16 à 30 °C).                                                                                                                                                  |

Cliquez ensuite sur **Tester la connexion** : la réponse liste les voitures trouvées dans
votre compte.

### Ajouter votre voiture

Ouvrez **Intégrations → Nissan Connect → Découverte** et créez la voiture. Un appareil
Gladys par voiture du compte, nommé d’après le surnom choisi dans l’application.

Si vous changez plus tard l’**unité de distance**, rouvrez **Découverte** et mettez la
voiture à jour, pour que son autonomie et son compteur affichent la nouvelle unité.

## Ce que montre l’appareil voiture

| Fonctionnalité                 | Description                                                    | Commande         |
| ------------------------------ | -------------------------------------------------------------- | ---------------- |
| **Batterie**                   | Niveau de charge, en %.                                        | —                |
| **Autonomie**                  | Autonomie estimée, en km ou en miles.                          | —                |
| **Branchée**                   | Le câble de charge est-il branché.                             | —                |
| **En charge**                  | La voiture charge-t-elle.                                      | Lancer / arrêter |
| **Climatisation**              | La clim (préchauffage / prérefroidissement) tourne-t-elle.     | Lancer / arrêter |
| **Température de la clim**     | Température demandée au prochain lancement de la clim.         | 16 à 30 °C       |
| **Température de l’habitacle** | Température dans la voiture, quand la voiture la donne.        | —                |
| **Compteur**                   | Distance totale, en km ou en miles.                            | —                |
| **Verrouillée**                | Les portes sont-elles verrouillées, quand la voiture le donne. | —                |

Les commandes à distance sont exécutées par la voiture un peu plus tard : Gladys affiche
tout de suite l’état demandé, puis relit la voiture environ 90 secondes après pour le
confirmer.

Le **badge de transport** de l’appareil indique la fraîcheur des données :

- **Cloud** : la dernière lecture a fonctionné.
- **Injoignable** : le cloud Nissan n’a pas répondu à la dernière lecture.
- **Cloud avec un point orange** : le cloud répond, mais la voiture n’a rien envoyé depuis
  plus de 24 heures (en veille, garée en sous-sol, hors couverture). Utilisez **Réveiller
  une voiture**.

### Lire ou réveiller ?

- Une **lecture** demande au cloud Nissan ce que la voiture a signalé en dernier. Elle ne
  coûte rien et a lieu à chaque **intervalle de rafraîchissement**.
- Un **réveil** demande à la voiture elle-même d’envoyer des données fraîches. Il passe par
  le réseau mobile et puise dans la batterie 12 V. Les nouvelles données arrivent dans
  Gladys quelques minutes plus tard.

Réveillez la voiture avec le bouton **Réveiller une voiture**, le bouton **Actualiser** du
widget, l’action de scène **Lire l’état d’une Nissan** (avec « Réveiller la voiture
d’abord »), ou automatiquement avec l’**intervalle de réveil de la voiture**.

## Boutons de l’écran de configuration

- **Tester la connexion** : se connecte et liste les voitures du compte.
- **Réveiller une voiture** : demande à la voiture choisie d’envoyer des données fraîches
  (batterie et position).
- **Identifier une voiture (feux clignotants)** : la voiture fait clignoter ses feux,
  pratique sur un parking.

## Scènes

### Déclencheurs

- **Une Nissan commence ou arrête de charger** — filtres : la voiture, l’événement (charge
  démarrée, charge arrêtée).
- **Une Nissan est branchée ou débranchée** — filtres : la voiture, l’événement (branchée,
  débranchée).

Les deux donnent à la scène ces variables : le nom de la voiture, l’événement, le niveau de
batterie (%) et l’autonomie. Ils sont vus à la **lecture** suivante de la voiture, donc avec
un retard pouvant aller jusqu’à l’intervalle de rafraîchissement, pas à la seconde près. Ils
ne se déclenchent jamais à la première lecture après le démarrage de Gladys.

Pour un seuil (« batterie sous 20 % »), utilisez le déclencheur standard **état d’un
appareil** de Gladys sur la fonctionnalité **Batterie**.

### Actions

- **Lancer ou arrêter la clim d’une Nissan** — la voiture, lancer ou arrêter, et une
  température facultative. Sortie : _ordre accepté_.
- **Lancer ou arrêter la charge d’une Nissan** — la voiture doit être branchée. Sortie :
  _ordre accepté_.
- **Lire l’état d’une Nissan** — lit la voiture maintenant, en la réveillant d’abord si vous
  le voulez. Sorties : batterie (%), autonomie, branchée, en charge — utilisez-les dans les
  actions suivantes (« si batterie < 30, envoie-moi un message »).
- **Faire clignoter les feux d’une Nissan** — feux seuls, ou feux et klaxon. Sortie :
  _ordre accepté_.

Un refus de Nissan n’arrête pas la scène : la sortie _ordre accepté_ vaut alors faux, et vous
pouvez la tester dans une condition.

Exemples :

- Chaque jour de semaine à 7 h 40, **lancer la clim** à 21 °C.
- Quand la voiture est **débranchée** et que sa batterie est sous 50 %, envoyer un message.
- Quand la voiture **arrête de charger**, lire l’état et annoncer l’autonomie.

## Widget du tableau de bord

Ajoutez le widget **Voiture Nissan** à un tableau de bord. Réglages :

- **Voiture** : la voiture à afficher (la première du compte si laissé vide).
- **Afficher le bouton carte** : ajoute un bouton qui ouvre la dernière position de la
  voiture sur OpenStreetMap. Désactivé par défaut : laissez-le désactivé sur un tableau de
  bord visible par d’autres.

Le widget affiche la batterie et l’autonomie en direct, si la voiture est branchée et en
charge (avec le temps restant), la clim, les portes et l’heure des dernières données de la
voiture. Ses boutons : **Actualiser** (réveille la voiture), **Lancer / Arrêter la clim**,
**Lancer / Arrêter la charge** (seulement si branchée), et la carte. Les boutons de clim et
de charge demandent une confirmation.

## Dépannage

| Symptôme                                                      | Que faire                                                                                                                    |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| « Nissan a refusé l’identifiant ou le mot de passe »          | Vérifiez-les en vous connectant à l’application NissanConnect Services, puis retapez-les dans Gladys.                        |
| « Connecté, mais ce compte NissanConnect n’a aucune voiture » | Activez d’abord la voiture dans l’application mobile, puis **Tester la connexion** à nouveau.                                |
| Les valeurs ne changent jamais                                | La voiture n’a rien signalé de nouveau : utilisez **Réveiller une voiture**, puis attendez quelques minutes.                 |
| Une fonctionnalité reste vide (habitacle, verrouillée)        | Votre modèle ne la transmet pas au cloud Nissan.                                                                             |
| Une commande est refusée                                      | La voiture est peut-être en veille, hors couverture, ou ne la prend pas en charge (commande de charge sur certains modèles). |
| « NissanConnect Services injoignable »                        | Le cloud Nissan est en panne ou a changé : réessayez plus tard, et vérifiez s’il existe une mise à jour de l’intégration.    |

Les journaux de l’intégration (Intégrations → Nissan Connect → Journaux) ne contiennent
jamais votre mot de passe ni vos jetons ; les lignes d’erreur nomment la requête et le VIN de
la voiture.

## Vie privée

- Votre identifiant et votre mot de passe ne sont envoyés qu’au serveur d’identité de
  Nissan, en HTTPS.
- Les jetons d’accès restent en mémoire, jamais sur disque.
- La position de la voiture ne sert qu’au bouton carte facultatif du widget.
- L’intégration ne verrouille ni ne déverrouille jamais les portes et ne demande jamais le
  code PIN de la voiture.
