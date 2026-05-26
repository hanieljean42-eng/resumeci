# 📝 Résumé - CÔTE D’IVOIRE – ÉCOLE NUMÉRIQUE

**Matière:** Mathématiques  
**Classe:** 5ème  
**Leçon:** Leçon 1 — NOMBRES PREMIERS  
**Thème:** Calculs algébriques

---

## 🎯 Points clés de la leçon

### 1. Notions fondamentales
- Puissances entières d'un nombre entier naturel
- Division euclidienne dans ℕ
- Nombres premiers et décomposition en facteurs premiers

### 2. Définitions importantes
- **Puissance** : aⁿ = a × a × … × a (n facteurs). n est l'exposant. a² = « a au carré », a³ = « a au cube ».
- **Division euclidienne** : Pour a et b entiers (b ≠ 0), a = b × q + r avec r < b. a = dividende, b = diviseur, q = quotient, r = reste.
- **Nombre premier** : Entier naturel ≥ 2 qui admet exactement deux diviseurs : 1 et lui-même.
- **Multiple** : Si r = 0 dans la division euclidienne, alors a est un multiple de b.

### 3. Méthodes / Formules
- **Cas particuliers** : 0ⁿ = 0 ; 1ⁿ = 1 ; a¹ = a ; a⁰ = 1
- **Propriété 1** : aⁿ × bⁿ = (a × b)ⁿ
- **Propriété 2** : aⁿ × aᵐ = aⁿ⁺ᵐ
- **Priorité** : Parenthèses → Puissances → ×/÷ → +/−
- **Encadrement** : b × q < a < b × (q + 1)
- **Test de primalité** : Diviser par 2, 3, 5, 7, 11… Si reste = 0 → pas premier. Si quotient ≤ diviseur → premier.

### 4. Exemples pratiques
- 3⁴ = 81 ; 2³ = 8 ; 5² = 25
- 71 est premier (quotient 6 < diviseur 11)
- 25 n'est pas premier (25 = 5 × 5)
- Décomposition : 40 = 2³ × 5 ; 56 = 2³ × 7
- Nombres premiers < 20 : 2, 3, 5, 7, 11, 13, 17, 19

---

## 📝 Résumé détaillé

### I. Puissances entières d'un nombre entier naturel

**Définition :** aⁿ est le produit de n facteurs tous égaux à a. L'exposant n doit être ≥ 1 (sauf convention a⁰ = 1).

**Règles de priorité :** Dans un calcul sans parenthèses, on effectue d'abord les puissances, puis les multiplications/divisions, et enfin les additions/soustractions. Les parenthèses restent toujours prioritaires.

**Propriétés de calcul :**
- aⁿ × bⁿ = (a × b)ⁿ → on regroupe des puissances de même exposant
- aⁿ × aᵐ = aⁿ⁺ᵐ → on additionne les exposants quand la base est la même

### II. Division euclidienne dans ℕ

Pour deux entiers a et b (b ≠ 0), il existe un unique couple (q, r) tel que **a = b × q + r** avec **r < b**.

Si r = 0, a est un **multiple** de b (b divise a).

**Encadrement :** Si a n'est pas un multiple de b, on l'encadre entre deux multiples consécutifs de b : b × q < a < b × (q + 1).

Exemple : 17 = 6 × 2 + 5, donc 12 < 17 < 18.

### III. Nombres premiers

**Définition :** Un nombre premier est un entier ≥ 2 dont les seuls diviseurs sont 1 et lui-même.

**Attention :** 1 n'est PAS premier. 2 est le seul nombre pair premier.

**Méthode pour tester la primalité :** Diviser successivement par 2, 3, 5, 7, 11… Si un reste est nul → pas premier. Si le quotient devient ≤ au diviseur sans reste nul → premier.

**Décomposition en facteurs premiers :** Tout entier ≥ 2 non premier peut s'écrire comme produit de nombres premiers. On divise par les plus petits facteurs premiers successifs.

Exemple : 40 = 2 × 2 × 2 × 5 = 2³ × 5


---

## ⚠️ Points à retenir pour l'examen

1. **a⁰ = 1** pour tout a, et **1 n'est pas un nombre premier**
2. **Propriétés des puissances** : aⁿ × bⁿ = (a×b)ⁿ et aⁿ × aᵐ = aⁿ⁺ᵐ
3. **Division euclidienne** : a = b × q + r avec r < b (toujours vérifier r < b)
4. **Test de primalité** : diviser par les nombres premiers croissants, comparer quotient et diviseur
5. **Décomposition** : diviser successivement par 2, 3, 5, 7… jusqu'à obtenir 1

---

## 📚 Contenu source (extrait du PDF)

<details>
<summary>Cliquez pour voir le texte original de la leçon</summary>

```
1
CÔTE D’IVOIRE – ÉCOLE NUMÉRIQUE
THEME : CALCULS ALGEBRIQUES
LEÇON 1 DE LA CLASSE DE CINQUIEME : NOMBRES PREMIERS
A- SITUATION D’APPRENTISSAGE
Lors d’une révision sur les nombres entiers naturels dans un collège, le professeur de mathématique
de la 5e8 demande à ses élèves de citer tous les chiffres qui permettent d’écrire tous les nombres
entiers naturels. Koffi cite les chiffres suivants 0 ; 1 ; 2 ; 3 ; 4 ; 5 ; 6 ; 7 ; 8 et 9. Yao dit que les
chiffres 2 ; 3 ; 5 et 7 sont des nombres premiers. Il est félicité par le professeur qui affirme à son tour
qu’il existe d’autres nombres premiers différents de ceux cités par Yao. Tous les élèves de cette classe
sont curieux de découvrir ces nombres.
B - CONTENU DE LA LEÇON
1 Puissances entières d’un nombre entier naturel
1.1 Définition
𝑎 est un nombre entier naturel et 𝑛 est un nombre entier naturel plus grand que 1.
an désigne le produit de n facteurs égaux au nombre a.
On a: an = 𝒂 × 𝒂 × 𝒂 × 𝒂 × 𝒂 × 𝒂 × … × 𝒂
Vocabulaire
an est une puissance du nombre a.
n est l’exposant
an se lit ‘’𝑎 exposant n’’
a2 se lit ‘’ 𝑎 exposant 2’’ ou « 𝑎 au carré »
a3 se lit ‘’ 𝑎 exposant 3’’ ou « 𝑎 au cube ».
Cas particuliers
* si n est un nombre entier naturel non nul, alors 0n = 0 et 1n = 1.
* si a est un nombre entier naturel quelconque, alors 𝑎1 = 𝑎.
* par convention a0 = 1.
Exercice de fixation
Recopie, puis complète le tableau ci-dessous.
Le nombre se lit est une
puissance
entière de
a pour
exposant
est le produit est
égal à
34
2 exposant 3
5 2
4 × 4 × 4
n facteurs égaux au nombre 𝑎
5ème
Mathématiques

-- 1 of 10 --

2
Réponses attendues
Le nombre se lit est une
puissance
entière de
a pour
exposant
est le produit est
égal à
34 3 exposant 4 3 4 3 × 3 × 3 × 3 81
23 2 exposant 3 2 3 2 × 2 × 2 8
52 5 exposant 2 5 2 5 × 5 25
43 4 exposant 3 4 3 4 × 4 × 4 64
1.2 Nouvelle règle de priorité
Règle
Dans une suite d’opérations :
• En présence de parenthèses, les calculs entre parenthèses sont prioritaires ;
• En l’absence de parenthèses, on effectue les calculs dans l’ordre suivant :
-les puissances ;
-la multiplication et la division ;
-les additions et les soustractions.
Exemple
• 3x(15-8) = 3 x 7 = 21
• 2- (34 -71) = 2-(81-71) = 2-10 = -8
1.3 Calcul avec les puissances
Propriété 1
a et b sont deux nombres entiers naturels, n est un nombre entier naturel non nul.
On a : an × bn = (a × b)n
Exercise de fixation
Récopie et Complete
74 × 84 = (… × …)….. ; (2 x 3)2 = … x ….
Réponses attendues
74 × 84 = (7 × 8)4 ; (2 x 3)2 = 22 x 32.
Propriété 2
a est un nombre entier naturel, n et m sont deux nombres entiers naturels non nuls.
On a : 𝑎n × 𝑎m = 𝑎n + m.
Exercice de fixation:
Recopie et complete
22×23 = …….. = …….
Réponse attendue
22×23 = 22+3 = 25
II - Division dans ℕ
1-Division euclidienne
Propriété
a et b sont deux nombres entiers naturels et b n’est pas nul.

-- 2 of 10 --

3
On peut trouver deux nombres entiers naturels q et r tels que : 𝑎 = 𝑏 × 𝑞 + 𝑟 et 𝑟 < 𝑏.
L’écriture 𝑎 = 𝑏 × 𝑞 + 𝑟 et 𝑟 < 𝑏 s’

[... contenu tronqué ...]
```

</details>

---

*Statut: Résumé rédigé*  
*Créé le: 25/05/2026*
