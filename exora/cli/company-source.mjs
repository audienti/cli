import { z } from 'zod';
const buckets = [[1,10],[11,50],[51,200],[201,500],[501,1000],[1001,5000],[5001,10000],[10001,Infinity]];
export const employeeRange = z.object({ start: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), end: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).strict().refine(range => range.start <= range.end, 'Use an ascending bounded employee range.');
export const companySizeEdit = z.object({ employeeCountRange: employeeRange, observedAt: z.string().datetime({ offset: true }) }).strict().refine(edit => buckets.some(([min,max]) => edit.employeeCountRange.start >= min && edit.employeeCountRange.end <= max), 'A selected manual size must fit one supported bucket.');
export const companySource = z.object({ kind: z.enum(['website','register','other']), url: z.string().max(2048), industry: z.string().max(200).optional(), location: z.string().max(200).optional(), note: z.string().max(500).optional(), companyProspectId: z.string().uuid().optional(), employeeCountRange: employeeRange.optional(), observedAt: z.string().datetime({ offset: true }).optional() }).strict().superRefine((source,context) => {
 const issue=message=>context.addIssue({code:'custom',message});
 if(!source.industry?.trim()&&!source.employeeCountRange)issue('State the industry or employee range.');
 if(source.employeeCountRange){if(!source.companyProspectId||!source.observedAt)issue('Cited size needs an authorized company claim and actual observation time.');}
 else if(source.companyProspectId||source.observedAt)issue('Company identity and time require an employee range.');
});
