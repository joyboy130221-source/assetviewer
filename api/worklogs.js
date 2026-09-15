const {
    escapeOslc,
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
 * Validate and normalize Worklog input.
 */
function normalize(input) {
    const description = String(
        input.description || ''
    ).trim();

    const longDescription = String(
        input.description_longdescription || ''
    ).trim();

    const logtype = String(
        input.logtype || ''
    ).trim().toUpperCase();

    if (!description) {
        throw Object.assign(
            new Error('Worklog description is required.'), {
                status: 400
            }
        );
    }

    if (!longDescription) {
        throw Object.assign(
            new Error('Worklog long description is required.'), {
                status: 400
            }
        );
    }

    if (!ALLOWED.has(logtype)) {
        throw Object.assign(
            new Error('Invalid worklog log type.'), {
                status: 400
            }
        );
    }

    return {
        description,
        description_longdescription: longDescription,
        logtype
    };
}


/**
 * ============================================================
 * LIST WORKLOGS
 * ============================================================
 *
 * Keep using MXAPIWORKLOG for listing.
 *
 * Example:
 *
 * /maximo/api/os/mxapiworklog
 *
 * or:
 *
 * /maxrest/api/os/mxapiworklog
 *
 * depending on the selected environment.
 */
async function listWorklogs(env, wonum, siteid) {

    if (!wonum) {
        throw Object.assign(
            new Error('Work Order number is required.'), {
                status: 400
            }
        );
    }

    const url = new URL(
        objectStructureUrl(env, 'mxapiworklog')
    );

    url.searchParams.set('lean', '1');

    url.searchParams.set(
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

    url.searchParams.set(
        'oslc.where',
        `recordkey="${escapeOslc(wonum)}"` +
        ` and class="WORKORDER"` +
        ` and siteid="${escapeOslc(siteid)}"`
    );

    url.searchParams.set(
        'oslc.orderBy',
        '-createdate'
    );

    const {
        data
    } = await maximoFetch(
        env,
        url
    );

    return Array.isArray(data.member) ?
        data.member :
        [];
}


/**
 * ============================================================
 * CREATE WORKLOG
 * ============================================================
 *
 * Keep existing MXAPIWORKLOG implementation for CREATE.
 *
 * POST:
 *
 * /os/mxapiworklog?lean=1
 */
async function createWorklog(
    env,
    wonum,
    siteid,
    input
) {

    if (!wonum) {
        throw Object.assign(
            new Error('Work Order number is required.'), {
                status: 400
            }
        );
    }

    const url = new URL(
        objectStructureUrl(env, 'mxapiworklog')
    );

    url.searchParams.set('lean', '1');

    const body = {
        recordkey: wonum,
        class: 'WORKORDER',
        siteid,
        ...normalize(input)
    };

    const {
        data
    } = await maximoFetch(
        env,
        url, {
            method: 'POST',
            body: JSON.stringify(body)
        }
    );

    return data;
}


/**
 * ============================================================
 * GET WORK ORDER INCLUDING WORKLOG RELATIONSHIP
 * ============================================================
 *
 * This is used specifically for UPDATE.
 *
 * Instead of trying to update:
 *
 *     /os/mxapiworklog
 *
 * we first retrieve the Work Order from:
 *
 *     /os/mxapiwo
 *
 * Maximo then gives us:
 *
 *     worklog_collectionref
 *
 * and:
 *
 *     worklog[].localref
 *
 * Example Server 1:
 *
 * /maximo/api/os/mxapiwo/
 * _QkVERk9SRC8xMzMw/modifyworklog/6-151
 *
 * Example Server 2:
 *
 * /maxrest/api/os/mxapiwo/
 * _QkVERk9SRC8xMzQ0/modifyworklog/0-116
 */
async function getWorkOrderWithWorklogs(
    env,
    wonum,
    siteid
) {

    if (!wonum) {
        throw Object.assign(
            new Error(
                'Work Order number is required to update a Worklog.'
            ), {
                status: 400
            }
        );
    }

    const url = new URL(
        objectStructureUrl(env, 'mxapiwo')
    );

    url.searchParams.set('lean', '1');

    /*
     * We intentionally request the Worklog relationship.
     *
     * "*" is used because your tested Maximo responses already
     * return:
     *
     * worklog_collectionref
     * worklog[]
     * worklog[].localref
     */
    url.searchParams.set(
        'oslc.select',
        '*'
    );

    url.searchParams.set(
        'oslc.where',
        `wonum="${escapeOslc(wonum)}"` +
        ` and siteid="${escapeOslc(siteid)}"`
    );

    const {
        data
    } = await maximoFetch(
        env,
        url
    );

    const members = Array.isArray(data.member) ?
        data.member :
        [];

    if (members.length === 0) {
        throw Object.assign(
            new Error(
                `Work Order ${wonum} was not found for site ${siteid}.`
            ), {
                status: 404
            }
        );
    }

    return members[0];
}


/**
 * ============================================================
 * FIND WORKLOG FROM MXAPIWO RESPONSE
 * ============================================================
 */
function findWorklog(
    workOrder,
    worklogid
) {

    const id = Number(worklogid);

    if (!Number.isFinite(id)) {
        throw Object.assign(
            new Error(
                'A valid worklogid is required.'
            ), {
                status: 400
            }
        );
    }

    const worklogs = Array.isArray(
            workOrder.worklog
        ) ?
        workOrder.worklog :
        [];

    const worklog = worklogs.find(
        item =>
        Number(item.worklogid) === id
    );

    if (!worklog) {
        throw Object.assign(
            new Error(
                `Worklog ${worklogid} was not found ` +
                `inside Work Order ${workOrder.wonum || ''}.`
            ), {
                status: 404
            }
        );
    }

    return worklog;
}


/**
 * ============================================================
 * GET WORKLOG UPDATE URL
 * ============================================================
 *
 * IMPORTANT:
 *
 * Do NOT use:
 *
 *     worklog.href
 *
 * because Maximo returns something like:
 *
 *     http://childkey#V09SS09SREVSL1dPUktMT0cvMTE2
 *
 *
 * Instead use:
 *
 *     worklog.localref
 *
 *
 * Server 1 example:
 *
 * https://.../maximo/api/os/mxapiwo/
 * _QkVERk9SRC8xMzMw/modifyworklog/6-151
 *
 *
 * Server 2 example:
 *
 * https://.../maxrest/api/os/mxapiwo/
 * _QkVERk9SRC8xMzQ0/modifyworklog/0-116
 */
function getWorklogUpdateUrl(worklog) {

    if (!worklog) {
        throw Object.assign(
            new Error(
                'Worklog is required.'
            ), {
                status: 500
            }
        );
    }

    if (!worklog.localref) {
        throw Object.assign(
            new Error(
                `Worklog ${worklog.worklogid || ''} ` +
                'does not contain localref.'
            ), {
                status: 500
            }
        );
    }

    let url;

    try {
        url = new URL(worklog.localref);
    } catch (error) {
        throw Object.assign(
            new Error(
                `Invalid Worklog localref: ${worklog.localref}`
            ), {
                status: 500
            }
        );
    }

    url.searchParams.set(
        'lean',
        '1'
    );

    return url;
}


/**
 * ============================================================
 * UPDATE WORKLOG
 * ============================================================
 *
 * NEW IMPLEMENTATION
 *
 * Flow:
 *
 * 1. GET Work Order from MXAPIWO.
 *
 * 2. Find Worklog by worklogid.
 *
 * 3. Read worklog.localref.
 *
 * 4. POST to localref using:
 *
 *      x-method-override: PATCH
 *      patchtype: MERGE
 *
 *
 * This supports both:
 *
 *      /maximo/api
 *
 * and:
 *
 *      /maxrest/api
 *
 * because the update URL comes directly from Maximo.
 */
async function updateWorklog(
    env,
    wonum,
    siteid,
    worklogid,
    input
) {

    if (
        worklogid === undefined ||
        worklogid === null ||
        String(worklogid).trim() === ''
    ) {
        throw Object.assign(
            new Error(
                `Worklog ID is missing. Received value: ${worklogid}`
            ),
            { status: 400 }
        );
    }

    const id = Number(worklogid);

    if (!Number.isFinite(id)) {
        throw Object.assign(
            new Error(
                `Invalid Worklog ID "${worklogid}". Worklog ID must be numeric.`
            ),
            { status: 400 }
        );
    }

    console.log('Updating Worklog:', {
        wonum,
        siteid,
        worklogid: id
    });

    const workOrder = await getWorkOrderWithWorklogs(
        env,
        wonum,
        siteid
    );

    const worklog = findWorklog(
        workOrder,
        id
    );

    const updateUrl =
        getWorklogUpdateUrl(worklog);

    console.log(
        'Maximo Worklog Update URL:',
        updateUrl.toString()
    );

    const { data } = await maximoFetch(
        env,
        updateUrl,
        {
            method: 'POST',

            headers: {
                'x-method-override': 'PATCH',
                patchtype: 'MERGE'
            },

            body: JSON.stringify(
                normalize(input)
            )
        }
    );

    return data;
}


/**
 * ============================================================
 * API HANDLER
 * ============================================================
 */
module.exports = async (
    req,
    res
) => {

    const body = parseBody(
        req.body
    );

    const wonum = String(
        req.query.wonum ||
        body.wonum ||
        ''
    ).trim();

    const siteid = String(
        req.query.siteid ||
        body.siteid ||
        'BEDFORD'
    ).trim();

    try {

        const env =
            await getEnvironment(
                req.query.env ||
                body.env
            );


        /**
         * GET
         *
         * List Worklogs.
         */
        if (req.method === 'GET') {

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
         * Only POST is accepted for
         * create/update from frontend.
         */
        if (req.method !== 'POST') {

            return res
                .status(405)
                .json({
                    error: 'Method not allowed'
                });
        }


        const operation = String(
                body.operation || 'create'
            )
            .trim()
            .toLowerCase();


        let data;


        /**
         * UPDATE
         */
        if (operation === 'update') {

            if (!wonum) {
                throw Object.assign(
                    new Error(
                        'Work Order number is required ' +
                        'to update a Worklog.'
                    ), {
                        status: 400
                    }
                );
            }

            data = await updateWorklog(
                env,
                wonum,
                siteid,
                body.worklogid,
                body
            );

        }

        /**
         * CREATE
         */
        else {

            data = await createWorklog(
                env,
                wonum,
                siteid,
                body
            );

        }


        return res.json({
            message: 'Worklog saved successfully.',
            data
        });

    } catch (error) {

        sendError(
            res,
            error,
            'Unable to process worklog.'
        );
    }
};


/**
 * ============================================================
 * EXPORT FUNCTIONS
 * ============================================================
 *
 * Keep exports available because other backend modules/tests
 * may import these functions.
 */
module.exports.listWorklogs =
    listWorklogs;

module.exports.createWorklog =
    createWorklog;

module.exports.updateWorklog =
    updateWorklog;

module.exports.getWorkOrderWithWorklogs =
    getWorkOrderWithWorklogs;

module.exports.findWorklog =
    findWorklog;

module.exports.getWorklogUpdateUrl =
    getWorklogUpdateUrl;