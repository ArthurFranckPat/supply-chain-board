def test_trend_type_enum():
    """TrendType must have three values: UPWARD, STABLE, DOWNWARD"""
    from src.agents.organization.models import TrendType

    assert hasattr(TrendType, 'UPWARD')
    assert hasattr(TrendType, 'STABLE')
    assert hasattr(TrendType, 'DOWNWARD')
    assert len(TrendType) == 3


def test_organization_type_dataclass():
    """OrganizationType stores type and hours"""
    from src.agents.organization.models import OrganizationType

    org = OrganizationType(type="1x8", hours=35)
    assert org.type == "1x8"
    assert org.hours == 35
    assert org.description == "Standard 1x8 (35h/week)"


def test_poste_charge_result():
    """PosteChargeResult stores charges by horizon"""
    from src.agents.organization.models import PosteChargeResult, TrendType

    result = PosteChargeResult(
        poste="PP_830",
        charge_s1=25.5,
        charge_s2=35.7,
        charge_s3=45.2,
        charge_s4=60.1
    )
    assert result.poste == "PP_830"
    assert result.charge_s1 == 25.5
    assert result.total_charge == 166.5

    # Test trend computation
    result.trend = TrendType.UPWARD
    result.slope = 11.5
    assert result.trend == TrendType.UPWARD