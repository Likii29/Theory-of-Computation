from flask import Flask, request, jsonify
from flask_cors import CORS
from regex_to_dfa_core import (
    infix_to_postfix,
    regex_to_nfa,
    nfa_to_dfa,
    minimize_dfa,
    build_machine_json,
)

app = Flask(__name__)
CORS(app)  # Allow React frontend to access backend


@app.route("/convert", methods=["POST"])
def convert():
    data = request.get_json() or {}
    regex = data.get("regex", "").strip()
    if not regex:
        return jsonify({"success": False, "error": "Empty regex"}), 400
    try:
        postfix = infix_to_postfix(regex)
        nfa = regex_to_nfa(postfix)
        dfa_states, dfa_trans, start, accepting, symbols = nfa_to_dfa(nfa)
        rep, min_trans, min_start, min_accepting = minimize_dfa(
            dfa_trans, symbols, start, accepting
        )

        dfa_json = build_machine_json(dfa_trans, start, accepting, symbols)
        min_json = build_machine_json(min_trans, min_start, min_accepting, symbols)

        return jsonify(
            {
                "success": True,
                "postfix": postfix,
                "dfa_json": dfa_json,
                "min_json": min_json,
                "symbols": sorted(symbols),
            }
        )
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True)