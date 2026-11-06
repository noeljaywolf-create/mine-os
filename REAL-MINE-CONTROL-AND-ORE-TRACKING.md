# MINE OS: simulation, real equipment and ore tracking

**Purpose:** Explain what the current Play button does, how the app differs from a future real system, and what a mine would need to track actual ore movement.  
**Status:** Planning guidance, not a design approval or an operating procedure.

## 1. What the Play button does today

The Play button starts the **simulation clock**. As simulated time passes, the application recalculates fictional mine conditions such as sump water levels, pump energy and production effects. Press it again to pause; speed controls change how quickly simulated time passes.

The button does **not** start a real pump, run a real conveyor, switch a generator or receive live measurements. MINE OS currently has no connection to mine equipment, PLCs, SCADA, historians, dispatch systems or a maintenance system. Its values, alarms and equipment states are synthetic.

## 2. Could a real system use the same interface?

A future system could use a similar-looking interface, but the current simulation must not be connected directly to equipment as if it were a production control system. A safe design must make these modes unmistakable:

1. **Simulation and training:** the clock advances a model. Actions affect only the fictional scenario.
2. **Live monitoring:** the interface displays approved, time-stamped real readings and indicates whether the connection is healthy. It does not imply that an operator has issued a command.
3. **Equipment control, if authorised:** separate and clearly labelled commands are submitted through an approved control architecture, with appropriate identity checks, permissions, confirmations, audit trails and safeguards.

Engineering and operations teams must review the real site's architecture, hazards, operating procedures, applicable standards and legal requirements. Equipment protection, emergency stops and safety interlocks must remain in appropriately engineered control and safety systems; they must not depend solely on a browser or on MINE OS. This document is not a certified architecture or a switching procedure.

## 3. How actual ore movement could be tracked

A production deployment would need approved data sources at appropriate points in the mine. The exact design depends on whether ore moves by trucks, conveyors, a shaft hoist, or a combination.

| Stage | Possible information source | What the system could show |
|---|---|---|
| Mining area | Loader or truck records, dispatch system or manual entry | Origin, time, vehicle and measured or estimated tonnes. |
| Underground transport | Dispatch events, truck scales or equipment records | Loads moved, route, destination and outstanding or delayed trips. |
| Hoist or conveyor | Hoist load measurement, belt scale or an approved control-system record | Recorded movement through the hoist or conveyor over time. |
| Stockpile or ore buffer | Deliveries, withdrawals, surveys or inventory measurements | Estimated inventory, adjusted when verified measurements become available. |
| Processing plant | Plant feed scale or approved production system | Ore delivered to processing and totals by shift or period. |

These are examples, not a claim that this application already connects to them or that every mine has the same instruments. A qualified site team would have to establish what each source measures, its units, accuracy, calibration and permitted use.

## 4. What operators and managers should see

A future live dashboard could show ore moved by area and shift, transport routes, hoist or conveyor throughput, estimated stockpile inventory, plant feed and differences from plan. Each figure should identify its source and last update time, and be labelled as **measured**, **manually entered**, **estimated**, or **unavailable**. A disconnected or stale feed must be visible; the interface must not silently present old data as current.

Stockpile balance can be represented as:

```text
estimated closing inventory = starting inventory + ore received − ore sent to the plant
```

Use the same units and time period for every term. In practice, measurement error, moisture, density, losses, timing differences, material on a conveyor or in transit, and corrections can affect the balance. Reconcile the estimate against surveys or other appropriate measurements and display the discrepancy; do not present a calculated inventory as an exact measured quantity.

## 5. Current app versus a future implementation

| Topic | Current MINE OS | Future real system would require |
|---|---|---|
| Ore routes and hoist | Synthetic route capacities and simulated flow. | Verified site configuration and approved data feeds. |
| Ore buffer | A simulated finite inventory and material ledger. | Measured or estimated inventory with reconciliation and uncertainty. |
| Controls | Scenario inputs only; no equipment commands. | A separately engineered and approved command path, if control is in scope. |
| Identity | A changeable demonstration role. | Appropriate authentication, authorisation and accountability. |
| Storage | In-memory demo state; refresh resets it. | A properly designed, durable operational record and backup process. |
| Alarms | Simulated conditions. | Site-approved alarm design, monitoring, response and testing. |

## 6. Questions to answer before a real project

- How does the mine move ore: trucks, conveyors, shaft hoist or a combination?
- Which dispatch, control, historian and plant systems already exist, and who owns them?
- Which measurements are available and calibrated, and how are tonnes, time and source location defined?
- Is the initial goal read-only monitoring, or is equipment control genuinely required?
- How are stockpiles surveyed and reconciled, and how is ore in transit handled?
- What happens during communication loss, missing data, duplicate records or incorrect measurements?
- What site-specific cybersecurity, safety, change-management and regulatory reviews are required?

Until those questions are addressed and the integration is engineered and validated, the current MINE OS must be treated as a **synthetic demonstration only**.
