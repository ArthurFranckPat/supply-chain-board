# Commandes utiles - Ordonnancement Production v2

---

## 🚀 Exécution principale

### Vérification standard (S+1)
```bash
python -m src.main --data-dir data --s1
```

### Vérification S+1 avec horizon personnalisé
```bash
python -m src.main --data-dir data --s1 --horizon 14
```

### Vérification S+1 avec prévisions Export
```bash
python -m src.main --data-dir data --s1 --with-previsions
```

### Vérification sans allocation virtuelle
```bash
python -m src.main --data-dir data --s1 --no-virtual-allocation
```

### Vérification d'un OF spécifique
```bash
python -m src.main --data-dir data --of F426-08419 --detailed
```

### Vérification d'une commande client
```bash
python -m src.main --data-dir data --commande AR2600885 --detailed
```

---

## 📊 Dashboard Streamlit

### Lancer le dashboard
```bash
streamlit run src/dashboards/app.py
```

### Avec port personnalisé
```bash
streamlit run src/dashboards/app.py --server.port 8502
```

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
pytest --cov=src --cov-report=html
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
python -c "from src.loaders import DataLoader; l = DataLoader('data'); l.load_all(); print(f'{len(l.articles)} articles, {len(l.ofs)} OFs')"
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
