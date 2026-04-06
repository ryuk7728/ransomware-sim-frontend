import json
import os
import shutil
import time
from pathlib import Path


def _write_event_log_stub(base_dir: Path, total_files: int, file_list: list[str], created_at: float) -> None:
    event_log_path = base_dir / "event_log.json"
    payload = {
        "workspace_initialized_at": created_at,
        "total_files": total_files,
        "file_list": file_list,
    }
    event_log_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _write_file(path: Path, content: str, timestamp: float) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    os.utime(path, (timestamp, timestamp))
    return str(path.resolve())


def generate_org_files(base_path: str) -> dict:
    """
    Create a fully synthetic organizational file tree for each simulation run.

    Timestamps are placed in the past so the watcher only reacts to attack-time
    modifications instead of the initial file generation.
    """
    base_dir = Path(base_path).resolve()
    org_dir = base_dir / "org_files"
    isolated_backup_dir = base_dir / "isolated_backup"
    connected_backup_dir = base_dir / "connected_backup"
    event_log_path = base_dir / "event_log.json"

    base_dir.mkdir(parents=True, exist_ok=True)

    for target in (org_dir, isolated_backup_dir, connected_backup_dir):
        if target.exists():
            shutil.rmtree(target)

    if event_log_path.exists():
        event_log_path.unlink()

    created_at = time.time()
    historical_base = created_at - 86400

    files_to_create: list[tuple[str, str]] = []

    for index in range(1, 11):
        files_to_create.append(
            (
                f"finance/invoice_{index:03d}.txt",
                "\n".join(
                    [
                        f"Invoice Number: INV-2025-{index:03d}",
                        "Vendor: Meridian Office Supplies",
                        f"Department: Finance Operations Cluster {((index - 1) % 3) + 1}",
                        f"Amount Due: INR {12500 + (index * 845):,.2f}",
                        f"Due Date: 2025-{((index - 1) % 12) + 1:02d}-{((index * 2) % 27) + 1:02d}",
                        "Payment Status: Pending Approval",
                    ]
                ),
            )
        )

    files_to_create.extend(
        [
            (
                "finance/q1_report.csv",
                "\n".join(
                    [
                        "month,revenue,expense,variance",
                        "January,1250000,1084000,166000",
                        "February,1312000,1149000,163000",
                        "March,1289000,1095000,194000",
                    ]
                ),
            ),
            (
                "finance/q2_report.csv",
                "\n".join(
                    [
                        "month,revenue,expense,variance",
                        "April,1345000,1198000,147000",
                        "May,1389000,1217000,172000",
                        "June,1401000,1242000,159000",
                    ]
                ),
            ),
            (
                "finance/budget_2025.json",
                json.dumps(
                    {
                        "fiscal_year": 2025,
                        "approved_by": "Board Finance Committee",
                        "departments": {
                            "finance": 2200000,
                            "hr": 1450000,
                            "operations": 4100000,
                            "management": 950000,
                        },
                        "contingency_reserve": 350000,
                    },
                    indent=2,
                ),
            ),
        ]
    )

    for index in range(1, 11):
        files_to_create.append(
            (
                f"hr/employee_{index:03d}.txt",
                "\n".join(
                    [
                        f"Employee ID: EMP-{index:03d}",
                        f"Name: Employee Placeholder {index:03d}",
                        f"Department: {'Operations' if index % 2 else 'Finance'}",
                        f"Joining Date: 202{index % 4}-0{((index - 1) % 9) + 1}-15",
                        "Employment Type: Full-Time",
                        "Emergency Contact: Redacted for simulation",
                    ]
                ),
            )
        )

    for index in range(1, 6):
        files_to_create.append(
            (
                f"hr/contracts/contract_{index:03d}.txt",
                "\n".join(
                    [
                        f"Contract ID: CT-{index:03d}",
                        "Counterparty: Simulated Staffing Partner",
                        "Term: 12 months",
                        f"Scope: Support staff augmentation wave {index}",
                        "Confidentiality Clause: Enabled",
                    ]
                ),
            )
        )

    files_to_create.append(
        (
            "hr/payroll_jan.csv",
            "\n".join(
                [
                    "employee_id,basic_pay,allowance,deduction,net_pay",
                    "EMP-001,65000,12000,5000,72000",
                    "EMP-002,62000,10000,4500,67500",
                    "EMP-003,71000,14000,6500,78500",
                ]
            ),
        )
    )

    for index in range(1, 11):
        files_to_create.append(
            (
                f"operations/server_log_{index:03d}.txt",
                "\n".join(
                    [
                        f"Host: app-node-{index:02d}",
                        "Environment: production-sim",
                        f"Last Patch Window: 2025-0{((index - 1) % 9) + 1}-2{index % 9}",
                        "Open Tickets: 2",
                        "Backup Agent: Healthy",
                    ]
                ),
            )
        )

    files_to_create.extend(
        [
            (
                "operations/config.json",
                json.dumps(
                    {
                        "service_name": "erp-gateway",
                        "region": "ap-south-sim",
                        "replicas": 3,
                        "logging_level": "INFO",
                        "backup_window": "02:00",
                    },
                    indent=2,
                ),
            ),
            (
                "operations/deployment_notes.txt",
                "\n".join(
                    [
                        "Deployment Notes",
                        "- Validate configuration checksum before restart",
                        "- Confirm backup snapshot status in control panel",
                        "- Review storage consumption after rollout",
                    ]
                ),
            ),
            (
                "management/strategy_doc.txt",
                "\n".join(
                    [
                        "Strategic Objective: Maintain business continuity under disruptive cyber incidents.",
                        "Priority 1: Preserve recoverability of line-of-business data.",
                        "Priority 2: Reduce detection delay through operational monitoring.",
                    ]
                ),
            ),
            (
                "management/board_minutes.txt",
                "\n".join(
                    [
                        "Board Minutes Summary",
                        "Agenda Item 1: Cyber resilience uplift budget approved.",
                        "Agenda Item 2: Disaster recovery tabletop scheduled for next quarter.",
                    ]
                ),
            ),
            (
                "management/risk_register.csv",
                "\n".join(
                    [
                        "risk_id,description,likelihood,impact,owner",
                        "R-001,Ransomware on shared storage,High,Critical,CISO",
                        "R-002,Backup validation drift,Medium,High,Infrastructure Lead",
                        "R-003,Delayed incident escalation,Medium,High,SOC Manager",
                    ]
                ),
            ),
        ]
    )

    file_list: list[str] = []
    for index, (relative_path, content) in enumerate(files_to_create):
        timestamp = historical_base + (index * 73)
        absolute_path = _write_file(org_dir / relative_path, content, timestamp)
        file_list.append(absolute_path)

    _write_event_log_stub(base_dir, len(file_list), file_list, created_at)

    return {
        "total_files": len(file_list),
        "file_list": file_list,
        "created_at": created_at,
    }
