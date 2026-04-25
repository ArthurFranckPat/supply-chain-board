# Commandes utiles - Ordonnancement Production v2

---

## 🚀 Execution principale

### Lancer l'API
```bash
cd apps/production-planning
uvicorn production_planning.api.server:app --reload --port 8000
```

### Charger les donnees et lancer le scheduler
```bash
curl -X POST http://127.0.0.1:8000/data/load
curl -X POST http://127.0.0.1:8000/runs/schedule
```

---

## 📊 Dashboard Streamlit

### Lancer le dashboard
> **Note**: le dashboard Streamlit a été supprimé. Utiliser l'UI board (`apps/board-ui`) à la place.
> Anciennement: `streamlit run production_planning/dashboards/app.py`

### Avec port personnalisé
> Supprimé. Voir `apps/board-ui`.

---

## 🧪 Tests

### Lancer tous les tests
```bash
pytest
```

### Tests spécifiques
```bash
# Tests du checker récursif
pytest tests/test_recursive_checker.py

# Tests de l'allocation
pytest tests/test_allocation_manager.py

# Tests du matching commande→OF
pytest tests/test_matching.py

# Tests des besoins clients
pytest tests/test_besoin_client.py
```

### Tests avec verbosité
```bash
pytest -v
```

### Tests avec couverture
```bash
pytest --cov=production_planning --cov-report=html
```

---

## 📦 Git

### Commit standard
```bash
git add .
git commit -m "feat: description"
git push
```

### Voir le statut
```bash
git status
git log --oneline -10
```

---

## 🔍 Analyse et débogage

### Vérifier les données chargées
```bash
python -c "from production_planning.loaders import DataLoader; l = DataLoader('data'); l.load_all(); print(f'{len(l.articles)} articles, {len(l.ofs)} OFs')"
```

### Comparer deux modes d'allocation
```bash
python compare_allocation_modes.py
```

### Vérifier la faisabilité d'un OF
```bash
python check_feasibility.py --of F426-08419
```

---

## 📝 Documentation

### Vérifier la documentation
```bash
cat CLAUDE.md
cat README.md
cat TODO.md
```

### Voir les mémoires
```bash
cat memory/MEMORY.md
cat memory/commands.md
cat memory/decisions.md
```

---

## ⚙️ Configuration

### Variables d'environnement (si utilisé)
```bash
export DATA_DIR="data"
export HORIZON_DAYS=7
```

### Fichiers de configuration
- `CLAUDE.md` : Instructions pour Claude
- `README.md` : Documentation utilisateur
- `requirements.txt` : Dépendances Python
