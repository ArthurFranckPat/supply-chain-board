import io
from contextlib import redirect_stdout

def test_format_organization_table():
    """Format results as console table"""
    from src.agents.organization.formatter import format_organization_table
    from src.agents.organization.models import PosteChargeResult, TrendType, OrganizationType

    result = PosteChargeResult(
        poste="PP_830",
        charge_s1=25.0,
        charge_s2=35.0,
        charge_s3=45.0,
        charge_s4=60.0,
        trend=TrendType.UPWARD,
        slope=11.67,
        recommended_org=OrganizationType(type="2x8", hours=70.0),
        charge_treated=25.0,
        coverage_pct=100.0
    )

    results = {"PP_830": result}

    # Capture stdout
    f = io.StringIO()
    with redirect_stdout(f):
        format_organization_table(results)
    output = f.getvalue()

    # Verify content
    assert "PP_830" in output
    assert "25.0h" in output
    assert ("⬆️" in output or "UPWARD" in output or "Hausse" in output)
    assert "2x8" in output
