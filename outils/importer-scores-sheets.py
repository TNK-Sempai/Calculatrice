# Transforme l'export CSV de la feuille Google "scores" (Apps Script) en
# SQL a coller dans l'editeur SQL de Supabase. Colonnes attendues dans
# l'ordre : jeu, nom, score, date, empreinte (la ligne d'en-tete est ignoree).
# Usage : python outils/importer-scores-sheets.py scores.csv > import.sql
import csv, re, sys

def texte(v):
    return "'" + str(v).replace("'", "''") + "'"

lignes = []
with open(sys.argv[1], newline="", encoding="utf-8") as f:
    for i, ligne in enumerate(csv.reader(f)):
        if len(ligne) < 4:
            continue
        jeu, nom, score, date = ligne[0].strip(), ligne[1].strip(), ligne[2].strip(), ligne[3].strip()
        if i == 0 and not re.match(r"^-?\d+$", score):
            continue
        nom = re.sub(r"[^A-Z0-9]", "", nom.upper())[:8] or "AAA"
        try:
            valeur = int(float(score))
        except ValueError:
            continue
        lignes.append(f"  ({texte(jeu)}, {texte(nom)}, {valeur}, coalesce(nullif({texte(date)}, '')::timestamptz, now()), 'import-sheets')")

print("insert into arcade.scores (jeu, pseudo, score, cree_le, origine) values")
print(",\n".join(lignes) + ";")
