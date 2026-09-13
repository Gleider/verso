import pytest

from tests.helpers import w


@pytest.fixture
def duas_frases():
    """Duas frases separadas por uma pausa longa o bastante para quebrar o verso."""
    return [
        w("a", 1000, 1120),
        w("cidade", 1120, 1500),
        w("acende", 1500, 1900),
        w("tarde", 1900, 2300),
        # pausa de 900 ms -> novo verso
        w("e", 3200, 3300),
        w("eu", 3300, 3450),
        w("conto", 3450, 3800),
        w("os", 3800, 3900),
        w("postes", 3900, 4300),
    ]
