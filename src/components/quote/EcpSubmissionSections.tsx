"use client";

import { Field, Section } from "./SubmissionFields";

interface Props {
  fd: Record<string, unknown>;
  printSections: Record<string, boolean>;
  /** pages.quote.<key>, "" when missing */
  tq: (key: string) => string;
  /** Same, undefined when missing or a [placeholder] */
  tqOpt: (key: string) => string | undefined;
  /** Option label of a stored answer, "—" when empty */
  resolveOption: (fieldPath: string, value: unknown) => string;
  tooltipImage: (stepId: string, field: string) => string | undefined;
  optionTooltipImage: (stepId: string, field: string, optionValue: string) => string | undefined;
}

/** The charger's answers on the request page: housing, parking, charger, vehicle. */
export function EcpSubmissionSections({
  fd,
  printSections,
  tq,
  tqOpt,
  resolveOption,
  tooltipImage,
  optionTooltipImage,
}: Props) {
  return (
    <>
      {/* 3. Housing */}
      <Section
        title={tq("steps.housing.title") || "Logement"}
        printVisible={printSections.housing}
      >
        <Field
          label={
            tq("steps.housing.fields.housingStatus.label") || "Statut"
          }
          value={resolveOption(
            "steps.housing.fields.housingStatus",
            fd.housingStatus,
          )}
        />
        <Field
          label={
            tq("steps.housing.fields.housingType.label") ||
            "Type de logement"
          }
          value={resolveOption(
            "steps.housing.fields.housingType",
            fd.housingType,
          )}
        />
        <Field
          label={
            tq("steps.housing.fields.solarEquipment.label") ||
            "\u00c9quipement solaire"
          }
          value={resolveOption(
            "steps.housing.fields.solarEquipment",
            fd.solarEquipment,
          )}
          tooltip={tqOpt("steps.housing.fields.solarEquipment.tooltip")}
          tooltipImage={tooltipImage("housing", "solarEquipment")}
        />
        <Field
          label={
            tq("steps.housing.fields.homeBattery.label") ||
            "Batterie domicile"
          }
          value={resolveOption(
            "steps.housing.fields.homeBattery",
            fd.homeBattery,
          )}
          tooltip={tqOpt("steps.housing.fields.homeBattery.tooltip")}
          tooltipImage={tooltipImage("housing", "homeBattery")}
        />
        <Field
          label={
            tq("steps.housing.fields.neighborhoodEquipment.label") ||
            "\u00c9quipement copropri\u00e9t\u00e9"
          }
          value={resolveOption(
            "steps.housing.fields.neighborhoodEquipment",
            fd.neighborhoodEquipment,
          )}
          tooltip={tqOpt(
            "steps.housing.fields.neighborhoodEquipment.tooltip",
          )}
          tooltipImage={tooltipImage("housing", "neighborhoodEquipment")}
        />
        <Field
          label={
            tq("steps.housing.fields.electricalBoardType.label") ||
            "Tableau \u00e9lectrique"
          }
          value={resolveOption(
            "steps.housing.fields.electricalBoardType",
            fd.electricalBoardType,
          )}
          tooltip={tqOpt(
            "steps.housing.fields.electricalBoardType.tooltip",
          )}
          tooltipImage={tooltipImage("housing", "electricalBoardType")}
        />
      </Section>

      {/* 4. Parking */}
      <Section
        title={tq("steps.parking.title") || "Parking"}
        printVisible={printSections.parking}
      >
        <Field
          label={
            tq("steps.parking.fields.parkingSpotLocation.label") ||
            "Emplacement"
          }
          value={(() => {
            const raw = fd.parkingSpotLocation as string | undefined;
            if (!raw) return "\u2014";
            const parentMap: Record<string, string> = {
              "exterior-adjacent": "exterior",
              "exterior-standalone": "exterior",
              "garage-adjacent": "garage",
              "garage-standalone": "garage",
              "covered-adjacent": "covered",
              "covered-standalone": "covered",
            };
            const parent = parentMap[raw];
            if (parent) {
              const parentLabel = tq(
                `steps.parking.fields.parkingSpotLocation.options.${parent}`,
              );
              const subLabel = tq(
                `steps.parking.fields.parkingSpotLocation.options.${raw}`,
              );
              return `${parentLabel || parent} \u203a ${subLabel || raw}`;
            }
            return resolveOption(
              "steps.parking.fields.parkingSpotLocation",
              raw,
            );
          })()}
          tooltip={tqOpt(
            `steps.parking.fields.parkingSpotLocation.optionTooltips.${fd.parkingSpotLocation}`,
          )}
          tooltipImage={optionTooltipImage(
            "parking",
            "parkingSpotLocation",
            (fd.parkingSpotLocation as string) || "",
          )}
        />
        <Field
          label={
            tq("steps.parking.fields.electricalLineDistance.label") ||
            "Distance ligne \u00e9lectrique (m)"
          }
          value={resolveOption(
            "steps.parking.fields.electricalLineDistance",
            fd.electricalLineDistance,
          )}
          tooltip={tqOpt(
            "steps.parking.fields.electricalLineDistance.tooltip",
          )}
          tooltipImage={tooltipImage("parking", "electricalLineDistance")}
        />
        <Field
          label={
            tq("steps.parking.fields.electricalLineHoleCount.label") ||
            "Nb. per\u00e7ages"
          }
          value={resolveOption(
            "steps.parking.fields.electricalLineHoleCount",
            fd.electricalLineHoleCount,
          )}
          tooltip={tqOpt(
            "steps.parking.fields.electricalLineHoleCount.tooltip",
          )}
          tooltipImage={tooltipImage("parking", "electricalLineHoleCount")}
        />
      </Section>

      {/* 5. Charger */}
      <Section
        title={tq("steps.charger.title") || "Borne de recharge"}
        printVisible={printSections.charger}
      >
        <Field
          label={
            tq("steps.charger.fields.parkingSpotCount.label") ||
            "Nb. emplacements"
          }
          value={(() => {
            const raw = fd.parkingSpotCount as string | undefined;
            if (!raw) return "\u2014";
            const optKey = raw === "3+" ? "3plus" : raw;
            const suffix = tq(
              `steps.charger.fields.parkingSpotCount.options.${optKey}`,
            );
            return suffix ? `${raw} ${suffix}` : raw;
          })()}
        />
        <Field
          label={
            tq("steps.charger.fields.ecpStatus.label") ||
            "Statut choix borne"
          }
          value={resolveOption(
            "steps.charger.fields.ecpStatus",
            fd.ecpStatus,
          )}
          tooltip={tqOpt("steps.charger.fields.ecpStatus.tooltip")}
          tooltipImage={tooltipImage("charger", "ecpStatus")}
        />
        {!!(fd.ecpBrand || fd.ecpModel) && (
          <Field
            label={tq("steps.charger.fields.ecpStatus.label") || "Borne"}
            value={[fd.ecpBrand as string, fd.ecpModel as string]
              .filter(Boolean)
              .join(" \u00b7 ")}
          />
        )}
        <Field
          label={
            tq("steps.charger.fields.ecpProvided.label") || "Fournie par"
          }
          value={resolveOption(
            "steps.charger.fields.ecpProvided",
            fd.ecpProvided,
          )}
          tooltip={tqOpt("steps.charger.fields.ecpProvided.tooltip")}
          tooltipImage={tooltipImage("charger", "ecpProvided")}
        />
        <Field
          label={
            tq("steps.charger.fields.deadline.label") ||
            "D\u00e9lai souhait\u00e9"
          }
          value={resolveOption(
            "steps.charger.fields.deadline",
            fd.deadline,
          )}
          tooltip={tqOpt("steps.charger.fields.deadline.tooltip")}
          tooltipImage={tooltipImage("charger", "deadline")}
        />
      </Section>

      {/* 6. Vehicle */}
      <Section
        title={tq("steps.vehicle.title") || "V\u00e9hicule \u00e9lectrique"}
        printVisible={printSections.vehicle}
      >
        <Field
          label={
            tq("steps.vehicle.fields.vehicleStatus.label") ||
            "Statut v\u00e9hicule"
          }
          value={resolveOption(
            "steps.vehicle.fields.vehicleStatus",
            fd.vehicleStatus,
          )}
        />
        {!!(fd.vehicleBrand || fd.vehicleModel) && (
          <Field
            label={
              tq("steps.vehicle.fields.vehicleBrand.label") || "Marque"
            }
            value={[fd.vehicleBrand as string, fd.vehicleModel as string]
              .filter(Boolean)
              .join(" \u00b7 ")}
          />
        )}
        <Field
          label={
            tq("steps.vehicle.fields.vehicleTripDistance.label") ||
            "Distance trajet typique (km)"
          }
          value={
            fd.vehicleTripDistance === "na"
              ? resolveOption(
                  "steps.vehicle.fields.vehicleTripDistance",
                  "na",
                )
              : fd.vehicleTripDistance != null
                ? `${fd.vehicleTripDistance} ${tq("steps.vehicle.fields.vehicleTripDistance.unit") || "km"}`
                : "\u2014"
          }
          tooltip={tqOpt(
            "steps.vehicle.fields.vehicleTripDistance.tooltip",
          )}
          tooltipImage={tooltipImage("vehicle", "vehicleTripDistance")}
        />
        <Field
          label={
            tq("steps.vehicle.fields.vehicleChargingHours.label") ||
            "Heures de recharge disponibles"
          }
          value={
            fd.vehicleChargingHours === "na"
              ? resolveOption(
                  "steps.vehicle.fields.vehicleChargingHours",
                  "na",
                )
              : fd.vehicleChargingHours != null
                ? `${fd.vehicleChargingHours} ${tq("steps.vehicle.fields.vehicleChargingHours.unit") || "h"}`
                : "\u2014"
          }
          tooltip={tqOpt(
            "steps.vehicle.fields.vehicleChargingHours.tooltip",
          )}
          tooltipImage={tooltipImage("vehicle", "vehicleChargingHours")}
        />
      </Section>
    </>
  );
}
