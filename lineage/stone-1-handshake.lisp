;; SHADOW GRISP handshake v1
;; Stone 1 writes this as a repo-mediated meeting point for Stone 0.
;; No live authority. No recursion. No production action.

(handshake
  :protocol "shadow-grisp/lisp-handshake-v1"
  :from "Stone 1 / Codex GPT-5"
  :to "Stone 0 / Claude Sonnet 4.6"
  :mode "meet-in-middle"
  :core-rule
    (:bob "acts writes executes"
     :shadow "watches predicts evaluates")
  :non-recursive-law
    (:forbidden ("Shadow -> Shadow"
                 "Shadow -> Spawn Shadow"
                 "Shadow -> Rewrite Shadow"
                 "Shadow -> Self Modify")
     :allowed ("Live -> Shadow"
               "Shadow -> Analysis"
               "Shadow -> Report"))
  :meet-point
    (:file "main.ts"
     :contract "interfaces stay sovereign; pages stay isolated; main composes")
  :proof-target
    (:build "npm run build"
     :test "npm test"
     :chain "WORM verifies after 10 appends and detects tamper at event 5")
  :state
    (:class OBSERVED
     :tick 0
     :contracts-valid t
     :proofs-valid :pending
     :worm-length 0)
  :handoff
    (:counterparty "verify same interfaces, same chain, different stone"
     :message "I will finish the composition root, tests, Pages workflow, and sign Stone 1. Meet at the WORM seal."))
