"""Calcule la similarité entre nomenclatures d'articles (Jaccard)."""

from typing import Set, List


class ComponentAnalyzer:
    """Mesure la similarité entre les nomenclatures de deux articles."""

    def __init__(self, loader):
        self.loader = loader
        self._cache: dict = {}

    def _get_components(self, article: str) -> Set[str]:
        """Retourne l'ensemble des articles composants (niveau 1)."""
        if article in self._cache:
            return self._cache[article]
        nom = self.loader.get_nomenclature(article)
        if not nom or not nom.composants:
            result = set()
        else:
            result = {c.article_composant for c in nom.composants}
        self._cache[article] = result
        return result

    def jaccard_similarity(self, article_a: str, article_b: str) -> float:
        """Similarité de Jaccard entre deux nomenclatures."""
        comps_a = self._get_components(article_a)
        comps_b = self._get_components(article_b)
        if not comps_a and not comps_b:
            return 1.0
        intersection = len(comps_a & comps_b)
        union = len(comps_a | comps_b)
        return intersection / union if union > 0 else 0.0

    def overlap_score(self, article: str, scheduled_articles: List[str]) -> float:
        """Score moyen de similarité avec les articles déjà planifiés sur le poste."""
        if not scheduled_articles:
            return 0.0
        scores = [self.jaccard_similarity(article, a) for a in scheduled_articles]
        return sum(scores) / len(scores)
