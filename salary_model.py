import datetime as dt


def _clamp(value, low, high):
    return max(low, min(high, value))


def _to_float(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str) and value.strip() == "":
        return None
    try:
        return float(value)
    except Exception:
        return None


def _to_int(value):
    if value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip() == "":
        return None
    try:
        return int(float(value))
    except Exception:
        return None


def _lerp(low, high, factor):
    return low + (high - low) * _clamp(factor, 0.0, 1.0)


def _gpa_multiplier(gpa, gpa_bands):
    if gpa is None:
        return 1.0, "Unknown"
    for band in gpa_bands:
        if band["min"] <= gpa <= band["max"]:
            return float(band["multiplier"]), band["label"]
    return 1.0, "Unknown"


def _salary_range(mid):
    return {
        "low": round(mid * 0.88, 2),
        "mid": round(mid, 2),
        "high": round(mid * 1.12, 2),
    }


def estimate_salary(payload: dict, salary_data: dict) -> dict:
    majors = salary_data["major_groups"]
    regions = salary_data["regions"]

    major_input = (payload.get("major_group") or "").strip()
    if major_input in majors:
        major_key = major_input
        major_known = major_input != "Other/Unknown"
    elif major_input == "Other":
        major_key = "Other/Unknown"
        major_known = False
    else:
        major_key = "Other/Unknown"
        major_known = False

    region_input = (payload.get("region") or "").strip()
    if region_input in regions:
        region = region_input
        region_known = True
    else:
        region = "Midwest"
        region_known = False

    school_tier = (payload.get("school_tier") or "Other").strip()
    if school_tier not in salary_data["school_tier_multipliers"]:
        school_tier = "Other"

    internships = str(payload.get("internships") or "0").strip()
    if internships not in salary_data["internship_multipliers"]:
        internships = "0"

    gpa = _to_float(payload.get("gpa"))
    graduation_year = _to_int(payload.get("graduation_year"))
    work_exp_years = _to_float(payload.get("work_experience_years"))
    if work_exp_years is None:
        work_exp_years = 0.0
    work_exp_years = _clamp(work_exp_years, 0.0, 5.0)

    skills = payload.get("skills") or []
    if isinstance(skills, str):
        skills = [s.strip() for s in skills.split(",") if s.strip()]
    valid_skills = [s for s in skills if s in salary_data["skills"]]

    high_cost_metro = bool(payload.get("high_cost_metro", False))

    major_data = majors[major_key]
    base_salary = float(major_data["baselines"].get(region, 60000.0))

    school_mult = float(salary_data["school_tier_multipliers"][school_tier])
    gpa_mult, gpa_band = _gpa_multiplier(gpa, salary_data["gpa_bands"])
    internship_mult = float(salary_data["internship_multipliers"][internships])
    region_col_mult = float(salary_data["region_col_multipliers"].get(region, 1.0))
    metro_mult = float(salary_data["high_cost_metro_multiplier"]) if high_cost_metro else 1.0
    experience_mult = 1.0 + (0.016 * work_exp_years)

    skill_boost = sum(float(salary_data["skills"][s]) for s in valid_skills)
    skill_boost = min(skill_boost, float(salary_data.get("max_skills_boost", 0.10)))

    estimate_mid = (
        base_salary
        * school_mult
        * gpa_mult
        * internship_mult
        * region_col_mult
        * metro_mult
        * experience_mult
        * (1.0 + skill_boost)
    )

    starting = _salary_range(estimate_mid)

    growth_factor = float(major_data["growth_factor"])
    growth_5 = _lerp(1.35, 1.70, growth_factor)
    growth_10 = _lerp(1.70, 2.60, growth_factor)

    year5 = _salary_range(estimate_mid * growth_5)
    year10 = _salary_range(estimate_mid * growth_10)

    confidence = 100
    confidence_reasons = []

    if not major_known:
        confidence -= 16
        confidence_reasons.append("Major is Other/Unknown, so baseline matching is less precise.")

    if not region_known:
        confidence -= 12
        confidence_reasons.append("Region missing or unknown; default region baseline used.")

    if graduation_year is None:
        confidence -= 8
        confidence_reasons.append("Graduation year missing.")
    else:
        current_year = dt.datetime.now().year
        if graduation_year < current_year - 40 or graduation_year > current_year + 6:
            confidence -= 8
            confidence_reasons.append("Graduation year is outside typical range.")

    if gpa is None:
        confidence -= 4
        confidence_reasons.append("GPA not provided.")

    if not valid_skills:
        confidence -= 6
        confidence_reasons.append("No recognized skills selected.")

    if school_tier == "Other":
        confidence -= 4
        confidence_reasons.append("School tier is broad ('Other').")

    confidence = int(_clamp(confidence, 35, 100))
    if not confidence_reasons:
        confidence_reasons.append("Inputs are complete and align with dataset categories.")

    drivers = [
        f"Major + region baseline: ${round(base_salary):,}",
        f"School tier multiplier: {school_mult:.2f}x",
        f"GPA band ({gpa_band}) multiplier: {gpa_mult:.2f}x",
        f"Internships multiplier: {internship_mult:.2f}x",
        f"Skills boost: +{round(skill_boost * 100, 1)}%",
        f"Regional cost adjustment: {region_col_mult:.2f}x",
        f"High-cost metro adjustment: {metro_mult:.2f}x",
        f"Work experience adjustment: {experience_mult:.2f}x",
    ]

    tips = []

    if internships == "0":
        tips.append("Get at least 1 internship to strengthen your starting offer potential.")
    elif internships == "1":
        tips.append("Add a second internship/co-op for stronger early-career signal.")

    if gpa is None:
        tips.append("Add GPA if strong to improve estimate confidence.")
    elif gpa < 3.5:
        tips.append("If possible, improve GPA toward 3.5+ for better recruiter filtering.")

    recommended_skills = salary_data["major_skill_focus"].get(major_key, salary_data["major_skill_focus"]["Other/Unknown"])
    missing_focus_skills = [s for s in recommended_skills if s not in valid_skills]
    if missing_focus_skills:
        tips.append("Add high-value skills for your field: " + ", ".join(missing_focus_skills[:2]) + ".")

    if not high_cost_metro:
        tips.append("Target higher-paying metro markets if location flexibility is possible.")

    if work_exp_years < 1:
        tips.append("Build practical experience via projects, part-time work, or freelance outcomes.")

    if school_tier in {"Community College", "Other"}:
        tips.append("Use certifications + portfolio projects to offset school-tier signaling.")

    while len(tips) < 4:
        tips.append("Network with alumni and tailor applications to role-specific outcomes.")

    return {
        "starting": starting,
        "year5": year5,
        "year10": year10,
        "confidence": {
            "score": confidence,
            "reasons": confidence_reasons,
        },
        "drivers": drivers,
        "tips": tips[:6],
        "inputs_used": {
            "major_group": major_key,
            "region": region,
            "school_tier": school_tier,
            "graduation_year": graduation_year,
            "gpa": gpa,
            "internships": internships,
            "skills": valid_skills,
            "work_experience_years": work_exp_years,
            "high_cost_metro": high_cost_metro,
        },
    }
