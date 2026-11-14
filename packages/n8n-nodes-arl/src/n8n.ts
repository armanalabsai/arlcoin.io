// The small part of n8n's node interface (n8n-workflow, MIT-compatible "Sustainable Use" API) that
// this package uses, declared here so the package has no dependency on n8n itself. n8n loads a
// node by its shape: a class with `description` and `execute`.

export type NodeParameterValue = string | number | boolean;

export interface INodePropertyOptions {
  name: string;
  value: string;
  description?: string;
  action?: string;
}

export interface INodeProperties {
  displayName: string;
  name: string;
  type: "string" | "number" | "options" | "boolean";
  default: NodeParameterValue;
  required?: boolean;
  description?: string;
  placeholder?: string;
  noDataExpression?: boolean;
  typeOptions?: { password?: boolean; minValue?: number };
  options?: INodePropertyOptions[];
  displayOptions?: { show: Record<string, string[]> };
}

export interface INodeTypeDescription {
  displayName: string;
  name: string;
  icon: string;
  group: string[];
  version: number;
  subtitle?: string;
  description: string;
  defaults: { name: string };
  inputs: string[];
  outputs: string[];
  usableAsTool?: boolean;
  credentials: { name: string; required: boolean }[];
  properties: INodeProperties[];
}

export interface INodeExecutionData {
  json: Record<string, unknown>;
  pairedItem?: { item: number };
}

export interface IExecuteFunctions {
  getInputData(): INodeExecutionData[];
  getNodeParameter(name: string, itemIndex: number, fallback?: NodeParameterValue): unknown;
  getCredentials(name: string): Promise<Record<string, unknown>>;
  continueOnFail(): boolean;
}

export interface INodeType {
  description: INodeTypeDescription;
  execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]>;
}

export interface ICredentialType {
  name: string;
  displayName: string;
  documentationUrl?: string;
  icon?: string;
  properties: INodeProperties[];
}
