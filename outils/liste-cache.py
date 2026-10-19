# =====================================================================
#  Regenere la liste des fichiers mis en cache par sw.js
#  A lancer depuis la racine du projet apres avoir ajoute ou renomme
#  un fichier :  python outils/liste-cache.py
#  Le numero de version du cache change a chaque fois, ce qui force les
#  visiteurs a recevoir la nouvelle version a leur prochaine visite.
# =====================================================================
import os, re, time

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOSSIERS = ["css", "js", "fonts", "icones"]
FICHIERS = ["./", "index.html", "manifest.webmanifest"]

for dossier in DOSSIERS:
    for base, _, noms in os.walk(os.path.join(RACINE, dossier)):
        for nom in sorted(noms):
            chemin = os.path.relpath(os.path.join(base, nom), RACINE).replace(os.sep, "/")
            FICHIERS.append(chemin)

sw = os.path.join(RACINE, "sw.js")
texte = open(sw, encoding="utf-8").read()
liste = ",\n".join('  "' + f + '"' for f in FICHIERS)
texte = re.sub(r"const FICHIERS = \[.*?\];", "const FICHIERS = [\n" + liste + "\n];", texte, flags=re.S)
texte = re.sub(r'const VERSION = "[^"]*";', 'const VERSION = "tanuki-calc-' + time.strftime("%Y%m%d-%H%M") + '";', texte)
open(sw, "w", encoding="utf-8", newline="\n").write(texte)
print(len(FICHIERS), "fichiers dans le cache")
