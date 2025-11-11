from collections import defaultdict, deque

EPSILON = "ε"


def infix_to_postfix(regex):
    precedence = {"*": 3, ".": 2, "|": 1}
    output, stack = [], []
    new_regex = ""
    for i in range(len(regex)):
        c1 = regex[i]
        new_regex += c1
        if i + 1 < len(regex):
            c2 = regex[i + 1]
            if c1 not in "(|" and c2 not in "|)*":
                new_regex += "."
    for c in new_regex:
        if c.isalnum():
            output.append(c)
        elif c == "(":
            stack.append(c)
        elif c == ")":
            while stack and stack[-1] != "(":
                output.append(stack.pop())
            stack.pop()
        else:
            while (
                stack
                and stack[-1] != "("
                and precedence.get(stack[-1], 0) >= precedence.get(c, 0)
            ):
                output.append(stack.pop())
            stack.append(c)
    while stack:
        output.append(stack.pop())
    return "".join(output)


class State:
    def __init__(self):
        self.transitions = defaultdict(list)


class NFA:
    def __init__(self, start, end):
        self.start = start
        self.end = end


def regex_to_nfa(postfix):
    stack = []
    for c in postfix:
        if c.isalnum():
            s1, s2 = State(), State()
            s1.transitions[c].append(s2)
            stack.append(NFA(s1, s2))
        elif c == ".":
            n2, n1 = stack.pop(), stack.pop()
            n1.end.transitions[EPSILON].append(n2.start)
            stack.append(NFA(n1.start, n2.end))
        elif c == "|":
            n2, n1 = stack.pop(), stack.pop()
            s, e = State(), State()
            s.transitions[EPSILON] += [n1.start, n2.start]
            n1.end.transitions[EPSILON].append(e)
            n2.end.transitions[EPSILON].append(e)
            stack.append(NFA(s, e))
        elif c == "*":
            n1 = stack.pop()
            s, e = State(), State()
            s.transitions[EPSILON] += [n1.start, e]
            n1.end.transitions[EPSILON] += [n1.start, e]
            stack.append(NFA(s, e))
    return stack.pop()


def epsilon_closure(states):
    stack, closure = list(states), set(states)
    while stack:
        s = stack.pop()
        for n in s.transitions.get(EPSILON, []):
            if n not in closure:
                closure.add(n)
                stack.append(n)
    return closure


def move(states, symbol):
    next_states = set()
    for s in states:
        next_states |= set(s.transitions.get(symbol, []))
    return next_states


def nfa_to_dfa(nfa):
    symbols = set()
    all_states, to_visit = {nfa.start}, [nfa.start]
    while to_visit:
        s = to_visit.pop()
        for sym, nexts in s.transitions.items():
            if sym != EPSILON:
                symbols.add(sym)
            for t in nexts:
                if t not in all_states:
                    all_states.add(t)
                    to_visit.append(t)

    start_closure = frozenset(epsilon_closure({nfa.start}))
    dfa_states = {start_closure: "q0"}
    dfa_trans, queue = {}, deque([start_closure])
    count = 1
    while queue:
        current = queue.popleft()
        for sym in sorted(symbols):
            next_state = frozenset(epsilon_closure(move(current, sym)))
            if not next_state:
                continue
            if next_state not in dfa_states:
                dfa_states[next_state] = f"q{count}"
                count += 1
                queue.append(next_state)
            dfa_trans[(dfa_states[current], sym)] = dfa_states[next_state]
    accepting = [dfa_states[s] for s in dfa_states if nfa.end in s]
    return dfa_states, dfa_trans, "q0", accepting, symbols


def minimize_dfa(dfa_trans, symbols, start, accepting):
    states = {s for (s, _) in dfa_trans} | {t for (_, t) in dfa_trans.items()}
    non_accepting = states - set(accepting)
    partitions = [set(accepting), set(non_accepting)]

    def group(s):
        for i, p in enumerate(partitions):
            if s in p:
                return i
        return -1

    changed = True
    while changed:
        changed = False
        new_partitions = []
        for p in partitions:
            groups = defaultdict(set)
            for s in p:
                sig = tuple(group(dfa_trans.get((s, sym))) for sym in sorted(symbols))
                groups[sig].add(s)
            new_partitions += groups.values()
            if len(groups) > 1:
                changed = True
        partitions = new_partitions

    rep = {}
    for p in partitions:
        r = sorted(p)[0]
        for s in p:
            rep[s] = r

    new_trans = {
        (rep[s], sym): rep[t] for (s, sym), t in dfa_trans.items() if s in rep and t in rep
    }
    new_start, new_accepting = rep[start], sorted(set(rep[s] for s in accepting))
    return rep, new_trans, new_start, new_accepting


def build_machine_json(dfa_trans, start, accepting, symbols):
    states, transitions = set(), []
    for (s, sym), t in dfa_trans.items():
        states |= {s, t}
        transitions.append({"from": s, "to": t, "symbol": sym, "id": f"{s}_{t}_{sym}"})
    return {
        "states": sorted(states),
        "start": start,
        "accepting": sorted(accepting),
        "transitions": transitions,
        "symbols": sorted(symbols),
    }