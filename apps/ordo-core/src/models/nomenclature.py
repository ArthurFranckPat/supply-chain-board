"""Modèle Nomenclature."""

from dataclasses import dataclass
from enum import Enum
from typing import Optional


class TypeArticle(Enum):
    """Type d'article (composant)."""

    ACHETE = "Acheté"
    FABRIQUE = "Fabriqué"


class NatureConsommation(Enum):
    """Nature de la consommation d'un composant."""

    FORFAIT = "Au Forfait"  # 1 unité par OF, indépendamment de la quantité fabriquée
    PROPORTIONNEL = "Proportionnel"  # Qté lien × Quantité fabriquée

    # Alias pour compatibilité
    @classmethod
    def from_string(cls, value: str) -> "NatureConsommation":
        """Crée une NatureConsommation depuis une chaîne, avec gestion des variations.

        Parameters
        ----------
        value : str
            Chaîne représentant la nature (ex: "Au Forfait", "FORFAIT", "Proportionnel")

        Returns
        -------
        NatureConsommation
            Instance correspondante
        """
        value_upper = value.upper().strip()

        if "FORFAIT" in value_upper or "À FORFAIT" in value_upper:
            return cls.FORFAIT
        elif "PROPORTIONNEL" in value_upper:
            return cls.PROPORTIONNEL
        else:
            # Défaut : proportionnel
            return cls.PROPORTIONNEL


@dataclass
class NomenclatureEntry:
    """Entrée de nomenclature (relation parent → composant).

    Attributes
    ----------
    article_parent : str
        Code de l'article parent (fabriqué)
    designation_parent : str
        Description de l'article parent
    niveau : int
        Niveau de profondeur (5, 10, 15, 20, 25...)
    article_composant : str
        Code du composant nécessaire
    designation_composant : str
        Description du composant
    qte_lien : float
        Quantité nécessaire pour 1 unité parent (peut être décimale)
    type_article : TypeArticle
        Type du composant ("Acheté" ou "Fabriqué")
    nature_consommation : NatureConsommation
        Nature de la consommation ("FORFAIT" ou "PROPORTIONNEL")
    """

    article_parent: str
    designation_parent: str
    niveau: int
    article_composant: str
    designation_composant: str
    qte_lien: float
    type_article: TypeArticle
    nature_consommation: NatureConsommation = NatureConsommation.PROPORTIONNEL  # Défaut

    def is_achete(self) -> bool:
        """Vérifie si le composant est acheté."""
        return self.type_article == TypeArticle.ACHETE

    def is_fabrique(self) -> bool:
        """Vérifie si le composant est fabriqué."""
        return self.type_article == TypeArticle.FABRIQUE

    @classmethod
    def from_csv_row(cls, row: dict) -> "NomenclatureEntry":
        """Crée une NomenclatureEntry à partir d'une ligne CSV.

        Parameters
        ----------
        row : dict
            Dictionnaire contenant les champs du CSV

        Returns
        -------
        NomenclatureEntry
            Instance de NomenclatureEntry créée à partir de la ligne CSV
        """
        # Remplacer la virgule par un point pour les nombres décimaux
        qte_str = str(row.get("Qté lien", "0")).replace(",", ".")
        qte_lien = float(qte_str) if qte_str else 0.0

        type_str = row.get("Type article", "Acheté")
        try:
            type_article = TypeArticle(type_str)
        except ValueError:
            type_article = TypeArticle.ACHETE

        # Lire la nature de consommation (défaut: PROPORTIONNEL pour compatibilité)
        nature_str = row.get("Nature consommation", "Proportionnel")
        try:
            nature_consommation = NatureConsommation.from_string(nature_str)
        except (ValueError, AttributeError):
            nature_consommation = NatureConsommation.PROPORTIONNEL

        return cls(
            article_parent=row.get("Article parent", ""),
            designation_parent=row.get("Designation parent", ""),
            niveau=int(row.get("Niveau", 0)),
            article_composant=row.get("Article composant", ""),
            designation_composant=row.get("Désignation composant", ""),
            qte_lien=qte_lien,
            type_article=type_article,
            nature_consommation=nature_consommation
        )

    def __repr__(self) -> str:
        """Représentation textuelle de l'entrée de nomenclature."""
        return (
            f"NomenclatureEntry({self.article_parent} → {self.article_composant}, "
            f"qte={self.qte_lien}, type={self.type_article.value})"
        )


@dataclass
class Nomenclature:
    """Nomenclature d'un article (liste des composants).

    Attributes
    ----------
    article : str
        Code de l'article parent
    designation : str
        Description de l'article parent
    composants : list[NomenclatureEntry]
        Liste des composants (entrées de nomenclature)
    """

    article: str
    designation: str
    composants: list[NomenclatureEntry]

    def get_composants_niveau(self, niveau: int) -> list[NomenclatureEntry]:
        """Retourne les composants d'un niveau donné.

        Parameters
        ----------
        niveau : int
            Niveau souhaité (5, 10, 15, etc.)

        Returns
        -------
        list[NomenclatureEntry]
            Liste des composants du niveau
        """
        return [c for c in self.composants if c.niveau == niveau]

    def get_composants_aches(self) -> list[NomenclatureEntry]:
        """Retourne les composants achetés uniquement.

        Returns
        -------
        list[NomenclatureEntry]
            Liste des composants achetés
        """
        return [c for c in self.composants if c.is_achete()]

    def get_composants_fabriques(self) -> list[NomenclatureEntry]:
        """Retourne les composants fabriqués uniquement.

        Returns
        -------
        list[NomenclatureEntry]
            Liste des composants fabriqués
        """
        return [c for c in self.composants if c.is_fabrique()]

    @classmethod
    def from_csv_rows(cls, article: str, rows: list[dict]) -> "Nomenclature":
        """Crée une Nomenclature à partir de plusieurs lignes CSV.

        Parameters
        ----------
        article : str
            Code de l'article parent
        rows : list[dict]
            Liste de dictionnaires contenant les lignes CSV

        Returns
        -------
        Nomenclature
            Instance de Nomenclature créée à partir des lignes CSV
        """
        if not rows:
            return cls(article=article, designation="", composants=[])

        # Récupérer la designation depuis la première ligne
        designation = rows[0].get("Designation parent", "")

        # Créer les entrées de nomenclature
        composants = [NomenclatureEntry.from_csv_row(row) for row in rows]

        return cls(article=article, designation=designation, composants=composants)

    def __repr__(self) -> str:
        """Représentation textuelle de la nomenclature."""
        return f"Nomenclature({self.article}: {len(self.composants)} composants)"
