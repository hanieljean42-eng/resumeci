---
name: videos-tiktok-resumeci
description: Génération de vidéos TikTok pour ResumeCI avec MoneyPrinterTurbo (installation locale C:\MPT, 100% sans clé API). À utiliser pour toute création de vidéo TikTok/Shorts/Reels liée à ResumeCI.
---

# Vidéos TikTok ResumeCI — MoneyPrinterTurbo

## RÈGLE ABSOLUE : dossier de sortie

**TOUTE vidéo générée pour la page TikTok ResumeCI doit être copiée dans :**

```
C:\Users\DJEBLE\OneDrive\Desktop\VIDEO RESUMECI\VIDEO RESUMECI
```

- Ne jamais laisser une vidéo uniquement dans `storage/tasks/` de MoneyPrinterTurbo.
- Après chaque génération terminée (task `state: 1`), copier `final-*.mp4` vers ce dossier.
- **Nommage existant (à suivre)** : `NN_ResumeCI_Titre.mp4` — le dossier contient déjà une série numérotée (`01_ResumeCI_Presentation_Officielle_5Scenes.mp4` → `13_...`). Prendre le prochain numéro libre en listant le dossier avant de nommer.

## Installation existante (ne pas réinstaller)

| Composant | Emplacement |
|---|---|
| Code source | `C:\MPT\MoneyPrinterTurbo` (v1.3.9) |
| Venv Python | `C:\mpt-venv` (jonction `.venv` dans le projet → `webui.bat` fonctionne tel quel) |
| Config | `C:\MPT\MoneyPrinterTurbo\config.toml` (dans .gitignore — éditer via `sed`/shell, pas l'outil edit) |
| Clips locaux | `C:\MPT\MoneyPrinterTurbo\storage\local_videos\` (ajouter des .mp4 ici pour varier les fonds) |
| Vidéos générées | `C:\MPT\MoneyPrinterTurbo\storage\tasks\{task_id}\final-*.mp4` |

## Config actuelle — zéro clé API

- `llm_provider = "ollama"` — LLM **local**, aucune clé. Modèle : `qwen2.5:3b` (upgradable vers `qwen2.5:7b` quand la connexion le permet : `ollama pull qwen2.5:7b` puis adapter `ollama_model_name`).
- `video_source = "local"` — pioche dans `storage/local_videos/` via `video_materials`.
- `subtitle_provider = "edge"` + voix `fr-FR-DeniseNeural-Female` (autre option : `fr-FR-HenriNeural-Male`).
- Si l'utilisateur fournit plus tard des clés (Pexels, Gemini, Groq…), les mettre dans `config.toml` et repasser `video_source = "pexels"` si Pexels.

## Prérequis avant de générer

1. **Ollama doit tourner** : `curl -s http://localhost:11434/api/version`. Sinon lancer `"C:\Users\DJEBLE\AppData\Local\Programs\Ollama\ollama.exe" serve` en arrière-plan.
2. **API MPT** : `cd C:\MPT\MoneyPrinterTurbo && PYTHONPATH=C:\MPT\MoneyPrinterTurbo C:\mpt-venv\Scripts\python.exe main.py` (en arrière-plan) → `http://127.0.0.1:8080/docs`.
3. Ou WebUI : `webui.bat` → `http://127.0.0.1:8501`.

## Générer une vidéo (API)

```bash
cat > /tmp/req.json <<'EOF'
{
  "video_subject": "SUJET_ICI",
  "video_aspect": "9:16",
  "video_language": "fr",
  "voice_name": "fr-FR-DeniseNeural-Female",
  "video_clip_duration": 5,
  "video_count": 1,
  "video_source": "local",
  "video_concat_mode": "sequential",
  "video_materials": [{"provider":"local","url":"clip_1.mp4"}],
  "subtitle_enabled": true,
  "subtitle_provider": "edge",
  "bgm_type": "random",
  "bgm_volume": 0.15,
  "n_threads": 4,
  "paragraph_number": 2
}
EOF
curl -s -X POST http://127.0.0.1:8080/api/v1/videos -H "Content-Type: application/json" -d @/tmp/req.json
```

Puis surveiller : `curl -s http://127.0.0.1:8080/api/v1/tasks/{task_id}` → attendre `state: 1`.

**Attention** : le rendu 1080×1920 + sous-titres prend ~15-25 min sur cette machine (CPU). Ne pas conclure à un blocage tant que le heartbeat `final video render still running` continue dans les logs.

## Après génération : OBLIGATOIRE

```bash
cp "C:\MPT\MoneyPrinterTurbo\storage\tasks\{task_id}\final-1.mp4" \
   "C:\Users\DJEBLE\OneDrive\Desktop\VIDEO RESUMECI\VIDEO RESUMECI\NN_ResumeCI_Titre.mp4"
```

Puis confirmer à l'utilisateur : nom du fichier, durée, chemin de destination.

## Notes

- Les accents passent mal en JSON via bash : écrire le body dans un fichier (`-d @fichier`) plutôt qu'en ligne.
- Le script généré par qwen2.5:3b peut contenir des coquilles — on peut fournir `video_script` directement dans la requête pour imposer un texte ResumeCI exact.
- `GET /api/v1/video_materials` liste les clips locaux disponibles.

## Pipeline AVATAR PARLANT (format viral « bébé qui parle »)

**Contrainte matérielle** : pas de GPU NVIDIA sur cette machine (Intel HD 520) → SadTalker/LivePortrait impossibles en local. Le pipeline local utilise l'**animation procédurale** (style PNG-tuber) : bouche synchronisée sur l'enveloppe audio, tête animée. Script : `C:\MPT\avatar_gen\talking_cartoon.py`. Assets : `C:\MPT\avatar_assets\`.

### Étapes

1. **Personnage** (gratuit, sans clé) — Pollinations image :
   `https://image.pollinations.ai/prompt/{PROMPT}?width=1024&height=1024&seed={n}&nologo=true`
   → visage de face, centré, occupant 50-70 % du cadre. Sauvegarder le jpg.
2. **Voix grave d'homme** : `fr-FR-HenriNeural` via `edge_tts` (venv `C:\mpt-venv`) ; alternative plus naturelle `fr-FR-RemyMultilingualNeural`. `rate='-5%'` pour appuyer la gravité.
3. **Calibrer la bouche** : croper un zoom visage, relever centre bouche (x,y) en pixels dans l'image source.
4. **Animation** : `python talking_cartoon.py --image perso.jpg --audio voix.mp3 --out raw.mp4 --mouth-x X --mouth-y Y --chara-scale 1.15` (~2-3 min pour 25 s).
5. **Sous-titres** : `faster_whisper` modèle `base` → srt, **corriger le texte** avec le script exact (Whisper fait des erreurs sur TTS).
6. **Assemblage ffmpeg** : overlay accroche (PNG PIL), `subtitles=` burn (FontSize=16, Outline=2), voix `volume=1.0`, BGM `volume=0.10` + `afade` sortie.
7. **Copier dans `VIDEO RESUMECI\VIDEO RESUMECI`** avec le prochain `NN_ResumeCI_Titre.mp4`.

### Améliorations futures possibles
- Fond du personnage : le jpg garde son fond gris (visible sur le dégradé) — détourer avec `rembg` si installé.
- Clignement des yeux, deux personnages en dialogue, mains gestuelles.
- Si un GPU apparaît : SadTalker (14,2K⭐) ou LivePortrait (19,3K⭐) pour du lip-sync photoréaliste ; sinon Hedra/Colab/HF Spaces.

## Pipeline DESSIN ANIMÉ 2D (style cartoon.max52 — sketchs multi-personnages)

Le format le plus viral en CI : sketchs animés 2D (directeur/élève, école ivoirienne),
~20 cuts caméra, lip-sync par bouches interchangeables. Pipeline 100 % local.

| Composant | Outil | Emplacement |
|---|---|---|
| Lip-sync phonémique | **rhubarb.exe** v1.14 (binaire, sans build) | `C:\MPT\rhubarb\Rhubarb-Lip-Sync-1.14.0-Windows\rhubarb.exe` |
| Moteur de rendu | `cartoon_engine.py` (PIL + ffmpeg) | `C:\MPT\cartoon_gen\` |
| Personnages | IA Pollinations fond vert → chroma-key | `C:\MPT\cartoon_assets\char_*.png` |
| Décors | idem | `bg_*.jpg` |
| Voix persos | Edge TTS : directeur=`fr-FR-HenriNeural`, élève=`fr-FR-EloiseNeural` (voix enfant) | chars.json |
| Config persos | `chars.json` : `mouth:[cx,cy,largeur]` en coords image 768² | `C:\MPT\cartoon_gen\chars.json` |

### Utilisation

```bash
cd C:\MPT\cartoon_gen
C:\mpt-venv\Scripts\python.exe cartoon_engine.py <script.json> <sortie.mp4>
```

- `script.json` : `shots[]` — `{char, bg, cam:closeup|medium|wide|establishing, text}` ou `{type:establishing, bg, duration}`.
- Par réplique : TTS → wav 16 k → rhubarb → visemes timées → bouche dessinée sur l'image source (cachée par visème) → frames.
- ~1 min de rendu par plan de 5 s. Puis copier dans `VIDEO RESUMECI` (règle absolue).
- Générer de nouveaux assets : `gen_assets.py` (respecte la limite Pollinations 1 img/45 s).

### Pièges résolus (ne pas régresser)
- Chroma-key : fond **verdâtre** (`g>r et g>b et g>90`), PAS distance RGB (la peau claire est à distance ~100 du vert sauge). Persos à générer sur fond vert `#00FF00`.
- `rhubarb -f json` seul (pas de `--exportFormat` en plus : doublon interdit).
- Texte TTS avec accents : passer par **fichier** UTF-8, jamais en argv (cp1252).
- Zoom closeup = 0.60-0.66 de la hauteur, pas 1.0.
- Watermark `pollinations.ai` : rogner le bas des bgs (0.92h) ; peindre le coin bas-droit des persos en couleur-fond avant key.
