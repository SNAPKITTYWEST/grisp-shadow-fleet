% Shadow Orchestrator Tau Prolog governance.
% This file is the swarm routing table. Node handles IO; Prolog decides
% whether an agent, status, or relay dispatch is allowed.

agent('orchestrator').
agent('icp-verifier').
agent('metric-stream').
agent('bifrost-translator').
agent('watermark').
agent('resurrect').

phase('icp-verifier', 'tick').
phase('metric-stream', 'tick').
phase('bifrost-translator', 'tick').
phase('watermark', 'tick').
phase('resurrect', 'dispatch').

agent_allowed(Agent, Phase) :-
    agent(Agent),
    phase(Agent, Phase).

dispatch_allowed('ransom_worm:dispatch').
dispatch_agent('ransom_worm:dispatch', 'resurrect').

dispatch_verdict(Type, Agent, 'ACCEPTED') :-
    dispatch_allowed(Type),
    dispatch_agent(Type, Agent).

status_allowed('orchestrator', 'ERROR').
status_allowed('icp-verifier', 'VERIFIED').
status_allowed('icp-verifier', 'offline').
status_allowed('icp-verifier', 'DRIFT_DETECTED').
status_allowed('metric-stream', 'UPDATED').
status_allowed('bifrost-translator', 'TRANSLATED').
status_allowed('bifrost-translator', 'IDLE').
status_allowed('watermark', 'WATERMARKED').
status_allowed('watermark', 'IDLE').
status_allowed('resurrect', 'ACCEPTED').
status_allowed(Agent, 'SKIPPED') :-
    agent(Agent).
status_allowed(Agent, 'ERROR') :-
    agent(Agent).

status_verdict(Agent, Status, 'ALLOW') :-
    agent(Agent),
    status_allowed(Agent, Status).
