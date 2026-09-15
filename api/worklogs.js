const {
    escapeOslc,
    findSingle,
    maximoFetch,
    objectStructureUrl,
    parseBody,
    sendError,
    getEnvironment
} = require('../lib/maximo');


const ALLOWED = new Set([
    'APPTNOTE',
    'CLIENTNOTE',
    'UPDATE',
    'WORK'
]);


/**
 * Normalize and validate Worklog input.
 */
function normalize(input) {

    const description =
        String(input.description || '').trim();

    const longDescription =
        String(
            input.description_longdescription || ''
        ).trim();

    const logtype =
        String(input.logtype || '')
            .trim()
            .toUpperCase();


    if (!description) {

        throw Object.assign(
            new Error(
                'Worklog description is required.'
            ),
            {
                status: 400
            }
        );
    }


    if (!longDescription) {

        throw Object.assign(
            new Error(
                'Worklog long description is required.'
            ),
            {
                status: 400
            }
        );
    }


    if (!ALLOWED.has(logtype)) {

        throw Object.assign(
            new Error(
                'Invalid worklog log type.'
            ),
            {
                status: 400
            }
        );
    }


    return {
        description,
        description_longdescription:
            longDescription,
        logtype
    };
}


/**
 * =========================================================
 * GET WORKLOG LIST
 * =========================================================
 *
 * Retrieve Worklogs belonging to a Work Order.
 *
 * Example:
 *
 * GET /maximo/api/os/mxapiworklog
 *      ?lean=1
 *      &oslc.where=recordkey="1344"
 *          and class="WORKORDER"
 *          and siteid="BEDFORD"
 */
async function listWorklogs(
    env,
    wonum,
    siteid
) {

    if (!wonum) {

        throw Object.assign(
            new Error(
                'Work Order number is required.'
            ),
            {
                status: 400
            }
        );
    }


    const u = new URL(
        objectStructureUrl(
            env,
            'mxapiworklog'
        )
    );


    u.searchParams.set(
        'lean',
        '1'
    );


    u.searchParams.set(
        'oslc.select',
        [
            'worklogid',
            'recordkey',
            'class',
            'siteid',
            'description',
            'description_longdescription',
            'logtype',
            'createby',
            'createdate',
            'modifyby',
            'modifydate',
            'href'
        ].join(',')
    );


    u.searchParams.set(
        'oslc.where',
        `recordkey="${escapeOslc(wonum)}" ` +
        `and class="WORKORDER" ` +
        `and siteid="${escapeOslc(siteid)}"`
    );


    u.searchParams.set(
        'oslc.orderBy',
        '-createdate'
    );


    const {
        data
    } = await maximoFetch(
        env,
        u
    );


    return Array.isArray(data?.member)
        ? data.member
        : [];
}


/**
 * =========================================================
 * CREATE WORKLOG
 * =========================================================
 *
 * Create a new Worklog using MXAPIWORKLOG.
 *
 * POST:
 *
 * /maximo/api/os/mxapiworklog?lean=1
 *
 * Body:
 *
 * {
 *     "recordkey": "1344",
 *     "class": "WORKORDER",
 *     "siteid": "BEDFORD",
 *     "description": "Work started",
 *     "description_longdescription": "...",
 *     "logtype": "WORK"
 * }
 */
async function createWorklog(
    env,
    wonum,
    siteid,
    input
) {

    if (!wonum) {

        throw Object.assign(
            new Error(
                'Work Order number is required.'
            ),
            {
                status: 400
            }
        );
    }


    if (!siteid) {

        throw Object.assign(
            new Error(
                'Site ID is required.'
            ),
            {
                status: 400
            }
        );
    }


    const normalized =
        normalize(input);


    const u = new URL(
        objectStructureUrl(
            env,
            'mxapiworklog'
        )
    );


    u.searchParams.set(
        'lean',
        '1'
    );


    const payload = {

        /*
         * Worklog Owner
         */
        recordkey: wonum,
        class: 'WORKORDER',
        siteid,

        /*
         * Worklog data
         */
        ...normalized
    };


    const {
        data
    } = await maximoFetch(
        env,
        u,
        {
            method: 'POST',

            body:
                JSON.stringify(
                    payload
                )
        }
    );


    return data;
}


/**
 * =========================================================
 * FIND WORKLOG
 * =========================================================
 *
 * Retrieve the Worklog resource first.
 *
 * This is important because Maximo returns the actual
 * resource URL inside "href".
 *
 * Example:
 *
 * {
 *     "worklogid": 123,
 *     "href":
 *       "https://server/maximo/api/os/mxapiworklog/_ABC123"
 * }
 */
async function findWorklog(
    env,
    worklogid
) {

    const id =
        Number(worklogid);


    if (!Number.isFinite(id)) {

        throw Object.assign(
            new Error(
                'A valid worklogid is required.'
            ),
            {
                status: 400
            }
        );
    }


    const item =
        await findSingle(
            env,
            'mxapiworklog',
            `worklogid=${id}`,
            [
                'worklogid',
                'recordkey',
                'class',
                'siteid',
                'description',
                'description_longdescription',
                'logtype',
                'href'
            ].join(',')
        );


    if (!item) {

        throw Object.assign(
            new Error(
                `Worklog ${worklogid} was not found.`
            ),
            {
                status: 404
            }
        );
    }


    if (!item.href) {

        throw Object.assign(
            new Error(
                `Worklog ${worklogid} does not contain a Maximo href.`
            ),
            {
                status: 500
            }
        );
    }


    return item;
}


/**
 * =========================================================
 * UPDATE WORKLOG
 * =========================================================
 *
 * IMPORTANT:
 *
 * Do NOT append:
 *
 *      /modifyworklog
 *
 * to the MXAPIWORKLOG href.
 *
 *
 * Previous implementation:
 *
 * mxapiworklog/{resource}/modifyworklog
 *
 *
 * New implementation:
 *
 * mxapiworklog/{resource}?lean=1
 *
 *
 * Request:
 *
 * POST mxapiworklog/{resource}?lean=1
 *
 * Headers:
 *
 * x-method-override: PATCH
 * patchtype: MERGE
 *
 *
 * This updates the Worklog resource directly.
 */
async function updateWorklog(
    env,
    worklogid,
    input
) {

    /*
     * Step 1
     *
     * Find existing Worklog.
     */
    const item =
        await findWorklog(
            env,
            worklogid
        );


    /*
     * Step 2
     *
     * Validate / normalize new values.
     */
    const payload =
        normalize(input);


    /*
     * Step 3
     *
     * Use the Worklog resource href
     * returned directly by Maximo.
     */
    const u =
        new URL(
            item.href
        );


    /*
     * Do NOT add:
     *
     * /modifyworklog
     *
     * We update MXAPIWORKLOG directly.
     */
    u.searchParams.set(
        'lean',
        '1'
    );


    /*
     * Step 4
     *
     * PATCH the Worklog resource.
     */
    const {
        data
    } = await maximoFetch(
        env,
        u,
        {
            method: 'POST',

            headers: {

                /*
                 * Maximo REST PATCH
                 */
                'x-method-override':
                    'PATCH',

                /*
                 * Only update fields
                 * included in payload.
                 */
                patchtype:
                    'MERGE'
            },

            body:
                JSON.stringify(
                    payload
                )
        }
    );


    return data;
}


/**
 * =========================================================
 * API HANDLER
 * =========================================================
 */
module.exports = async (
    req,
    res
) => {

    const body =
        parseBody(
            req.body
        );


    const wonum =
        String(
            req.query.wonum ||
            body.wonum ||
            ''
        ).trim();


    const siteid =
        String(
            req.query.siteid ||
            body.siteid ||
            'BEDFORD'
        ).trim();


    try {

        /*
         * Get Maximo environment.
         */
        const env =
            await getEnvironment(
                req.query.env ||
                body.env
            );


        /**
         * =================================================
         * GET
         * =================================================
         *
         * Retrieve Worklogs.
         */
        if (
            req.method === 'GET'
        ) {

            const data =
                await listWorklogs(
                    env,
                    wonum,
                    siteid
                );


            return res.json({
                data
            });
        }


        /**
         * =================================================
         * POST ONLY
         * =================================================
         */
        if (
            req.method !== 'POST'
        ) {

            return res
                .status(405)
                .json({
                    error:
                        'Method not allowed'
                });
        }


        /**
         * =================================================
         * OPERATION
         * =================================================
         *
         * operation = update
         *
         *      Update existing Worklog
         *
         *
         * operation = create
         *
         *      Create new Worklog
         */


        const operation =
            String(
                body.operation ||
                'create'
            )
                .trim()
                .toLowerCase();


        let data;


        /**
         * UPDATE
         */
        if (
            operation === 'update'
        ) {

            data =
                await updateWorklog(
                    env,
                    body.worklogid,
                    body
                );
        }


        /**
         * CREATE
         */
        else if (
            operation === 'create'
        ) {

            data =
                await createWorklog(
                    env,
                    wonum,
                    siteid,
                    body
                );
        }


        /**
         * UNKNOWN OPERATION
         */
        else {

            throw Object.assign(
                new Error(
                    `Unsupported Worklog operation: ${operation}`
                ),
                {
                    status: 400
                }
            );
        }


        return res.json({

            message:
                operation === 'update'
                    ? 'Worklog updated successfully.'
                    : 'Worklog created successfully.',

            data
        });


    } catch (error) {

        /*
         * maximoFetch() is also responsible
         * for recording the Maximo request /
         * response into the API Request Log.
         */
        sendError(
            res,
            error,
            'Unable to process worklog.'
        );
    }
};


/**
 * Export functions for testing / reuse.
 */
module.exports.listWorklogs =
    listWorklogs;

module.exports.createWorklog =
    createWorklog;

module.exports.updateWorklog =
    updateWorklog;

module.exports.findWorklog =
    findWorklog;