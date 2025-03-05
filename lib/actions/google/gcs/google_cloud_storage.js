"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleCloudStorageAction = void 0;
const winston = require("winston");
const http_errors_1 = require("../../../error_types/http_errors");
const utils_1 = require("../../../error_types/utils");
const Hub = require("../../../hub");
const action_response_1 = require("../../../hub/action_response");
const storage = require("@google-cloud/storage");
const FILE_EXTENSION = new RegExp(/(.*)\.(.*)$/);
const LOG_PREFIX = "[Google Cloud Storage]";
class GoogleCloudStorageAction extends Hub.Action {
    constructor() {
        super(...arguments);
        this.name = "google_cloud_storage";
        this.label = "Google Cloud Storage";
        this.iconName = "google/gcs/google_cloud_storage.svg";
        this.description = "Write data files to a Google Cloud Storage bucket.";
        this.supportedActionTypes = [Hub.ActionType.Dashboard, Hub.ActionType.Query];
        this.usesStreaming = true;
        this.requiredFields = [];
        this.params = [
            {
                name: "client_email",
                label: "Client Email",
                required: true,
                sensitive: false,
                description: "Your client email for GCS from https://console.cloud.google.com/apis/credentials",
            }, {
                name: "private_key",
                label: "Private Key",
                required: true,
                sensitive: true,
                description: "Your private key for GCS from https://console.cloud.google.com/apis/credentials",
            }, {
                name: "project_ids",
                label: "Comma Separated Project Ids",
                required: true,
                sensitive: false,
                description: "Comma separated Project Ids for your GCS project from https://console.cloud.google.com/apis/credentials",
            }, {
                name: "tenant_ids",
                label: "Comma Separated Tenant Ids",
                required: true,
                sensitive: false,
                description: "Comma separated Tenant Ids in the above GCS project",
            },
        ];
    }
    async execute(request) {
        const response = new Hub.ActionResponse();
        if (!request.formParams.bucket) {
            const error = (0, action_response_1.errorWith)(http_errors_1.HTTP_ERROR.bad_request, `${LOG_PREFIX} needs a GCS bucket specified.`);
            response.success = false;
            response.error = error;
            response.message = error.message;
            response.webhookId = request.webhookId;
            winston.error(`${error.message}`, { error, webhookId: request.webhookId });
            return response;
        }
        let filename = request.formParams.filename || request.suggestedFilename();
        // If the overwrite formParam exists and it is "no" - ensure a timestamp is appended
        if (request.formParams.overwrite && request.formParams.overwrite === "no") {
            const captures = filename.match(FILE_EXTENSION);
            if (captures && captures.length > 1) {
                filename = captures[1] + `_${Date.now()}.` + captures[2];
            }
            else {
                filename += `_${Date.now()}`;
            }
        }
        if (!filename) {
            const error = (0, action_response_1.errorWith)(http_errors_1.HTTP_ERROR.bad_request, `${LOG_PREFIX} request did not contain filename, or invalid filename was provided.`);
            response.success = false;
            response.error = error;
            response.message = error.message;
            response.webhookId = request.webhookId;
            winston.error(`${error.message}`, { error, webhookId: request.webhookId });
            return response;
        }
        const projectId = request.formParams.project_id
        const tenantId = request.formParams.tenant_id
        const longBucket = projectId + "-looker-exports-" + tenantId
        const shortBucket = this.toShortProject(projectId) + "-looker-exports-" + tenantId
        const bucket = longBucket.length > 63 ? shortBucket : longBucket
        const gcs = this.gcsClientFromRequest(request, projectId);
        const file = gcs.bucket(bucket).file(filename);
        const writeStream = file.createWriteStream();
        try {
            await request.stream(async (readable) => {
                return new Promise((resolve, reject) => {
                    readable.pipe(writeStream)
                        .on("error", reject)
                        .on("finish", resolve);
                });
            });
            return new Hub.ActionResponse({ success: true });
        }
        catch (e) {
            const errorType = (0, utils_1.getHttpErrorType)(e, this.name);
            const error = (0, action_response_1.errorWith)(errorType, `${LOG_PREFIX} ${e.message}`);
            response.success = false;
            response.error = error;
            response.message = error.message;
            response.webhookId = request.webhookId;
            winston.error(`${LOG_PREFIX} ${error.message}`, { error, webhookId: request.webhookId });
            return response;
        }
    }
    async form(request) {
        const form = new Hub.ActionForm();
        const projects = request.params.project_ids.split(",")
        const tenants = request.params.tenant_ids(",")
        
        form.fields = [{
                label: "League Project",
                name: "project_id",
                required: true,
                options: projects.map((p) => {
                    return { name: p, label: this.toShortProject(p) };
                }),
                type: "select",
                default: projects[0],
            }, {
                label: "Tenant",
                name: "tenant_id",
                required: true,
                options: tenants.map((t) => {
                    return { name: t, label: t };
                }),
                type: "select",
                default: tenants[0],
            }, {
                label: "Filename",
                name: "filename",
                type: "string",
            }, {
                label: "Overwrite",
                name: "overwrite",
                options: [{ label: "Yes", name: "yes" }, { label: "No", name: "no" }],
                default: "yes",
                description: "If Overwrite is enabled, will use the title or filename and overwrite existing data." +
                    " If disabled, a date time will be appended to the name to make the file unique.",
            }];
        return form;
    }
    gcsClientFromRequest(request, project) {
        const credentials = {
            client_email: request.params.client_email,
            private_key: request.params.private_key.replace(/\\n/g, "\n"),
        };
        const config = {
            projectId: project,
            credentials,
        };
        return new storage(config);
    }
    toShortProject(p) {
        if (p.length > 16 && p.startsWith("league-") && p.endsWith("-datalake")) {
            return p.substring(7, p.length - 9);
        }
        return p;
    }
}
exports.GoogleCloudStorageAction = GoogleCloudStorageAction;
Hub.addAction(new GoogleCloudStorageAction());
