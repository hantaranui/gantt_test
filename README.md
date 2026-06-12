# Widget Gantt — LaSuite.coop

Un widget Gantt pour **Grist**, construit sur la base du widget Kanban LaSuite et pensé pour réutiliser la même table.

Chaque ligne de la table devient une barre temporelle. Le widget lit les colonnes de dates, de titre, de statut/couleur, d'assignation et d'avancement directement depuis Grist.

## Fonctionnalités

| Fonctionnalité | Description |
|---|---|
| Vue Gantt | Affiche les lignes Grist sur une frise temporelle |
| Dates configurables | Choisissez la colonne de début et la colonne de fin |
| Titre configurable | Choisissez le champ affiché dans la liste et sur les barres |
| Couleurs par statut | Utilise les couleurs d'une colonne Choice Grist |
| Échelles | Jour, semaine ou mois |
| Avancement | Affiche une progression si une colonne numérique existe |
| Produit | Affiche le produit dans la ligne de gauche |
| Assigné | Affiche la personne responsable avec ses initiales, comme dans le Kanban |
| Détails repliables | Cliquez sur le titre pour ouvrir les autres champs de la ligne |
| Champs visibles | Choisissez les informations affichées dans le détail |
| Sélection Grist | Cliquez sur une ligne ou une barre pour sélectionner l'enregistrement dans Grist |

## Colonnes recommandées dans Grist

| Colonne | Type Grist | Obligatoire ? | Rôle |
|---|---|---|---|
| `Titre` ou `Nom` | Texte | Oui | Nom de la tâche |
| `Date_debut` | Date | Oui | Début de la barre |
| `Date_fin` ou `Echeance` | Date | Oui | Fin de la barre |
| `Statut` | Choice | Optionnel | Couleur de la barre |
| `Avancement` | Numérique | Optionnel | Pourcentage de progression |
| `Responsable`, `Assigné` ou `Testeur` | Texte, Ref ou Choice | Optionnel | Information affichée sous le titre |

Le widget essaie de deviner automatiquement ces colonnes avec leurs noms. Vous pouvez tout changer ensuite dans la barre d'outils.

Par défaut, l'affichage reste compact : titre, produit, assigné et dates. Les autres colonnes apparaissent seulement quand vous cliquez sur le titre d'une ligne.

## Installer dans Grist

1. Hébergez ces fichiers sur GitHub Pages ou sur un autre hébergement statique :
   - `index.html`
   - `widget.js`
   - `widget.css`
   - `render.js`
   - `config.js`
2. Dans Grist, ajoutez une vue **Personnalisée** liée à la table souhaitée.
3. Collez l'URL du widget.
4. Choisissez **Accès complet au document** pour permettre la sélection des lignes et la lecture des métadonnées.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Page du widget |
| `widget.js` | Connexion Grist, options et rendu Gantt |
| `widget.css` | Style LaSuite |
| `render.js` | Rendu des valeurs Grist |
| `config.js` | Ancien panneau de configuration conservé pour compatibilité |

## Notes

- Le Gantt n'écrit pas encore les dates dans Grist par glisser-déposer.
- Les couleurs proviennent d'une colonne `Choice` quand elle est sélectionnée dans le contrôle **Couleur**.
- Si une tâche n'a pas de date de fin, le widget utilise la date de début comme fin.
