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
 * Normalize a Maximo Work Order href so it always targets the
 * modifyworklog action.
 *
 * Some environments return:
 *   .../mxapiwo/{resource}/modifyworklog
 *
 * Other environments return:
 *   .../mxapiwo/{resource}
 *
 * This function supports both.
 */
function getModifyWorklogUrl(href) {
    if (!href) {
        throw Object.assign(
            new Error('Maximo worklog href is required.'),
            {
                status: 500
            }
        );
    }

    const u = new URL(href);

    // Remove trailing slash if it exists
    const cleanPath = u.pathname.replace(/\/+$/, '');

    // Add /modifyworklog only when Maximo did not already
    // include it in the returned href.
    if (!cleanPath.toLowerCase().endsWith('/modifyworklog')) {
        u.pathname = `${cleanPath}/modifyworklog`;
    }

    u.searchParams.set('lean', '1');

    return u;
}

function normalize(i) {

    const description =
        String(i.description || '').trim();

    const long =
        String(i.description_longdescription || '').trim();

    const logtype =
        String(i.logtype || '').trim().toUpperCase();

    if (!description) {
        throw Object.assign(
            new Error('Worklog description is required.'),
            {
                status: 400
            }
        );
    }

    if (!long) {
        throw Object.assign(
            new Error('Worklog long description is required.'),
            {
                status: 400
            }
        );
    }

    if (!ALLOWED.has(logtype)) {
        throw Object.assign(
            new Error('Invalid worklog log type.'),
            {
                status: 400
            }
        );
    }

    return {
        description,
        description_longdescription: long,
        logtype
    };
}

async function listWorklogs(env, wonum, siteid) {

    const u = new URL(
        objectStructureUrl(env, 'mxapiworklog')
    );

    u.searchParams.set('lean', '1');

    u.searchParams.set(
        'oslc.select',
        'worklogid,recordkey,class,siteid,' +
        'description,description_longdescription,' +
        'logtype,createby,createdate,' +
        'modifyby,modifydate,href'
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
    } = await maximoFetch(env, u);

    return Array.isArray(data.member)
        ? data.member
        : [];
}

async function createWorklog(
    env,
    wonum,
    siteid,
    input
) {

    const u = new URL(
        objectStructureUrl(env, 'mxapiworklog')
    );

    u.searchParams.set(
        'lean',
        '1'
    );

    return (
        await maximoFetch(
            env,
            u,
            {
                method: 'POST',

                body: JSON.stringify({
                    recordkey: wonum,
                    class: 'WORKORDER',
                    siteid,
                    ...normalize(input)
                })
            }
        )
    ).data;
}

async function updateWorklog(
    env,
    id,
    input
) {

    const n = Number(id);

    if (!Number.isFinite(n)) {

        throw Object.assign(
            new Error(
                'A valid worklogid is required.'
            ),
            {
                status: 400
            }
        );
    }

    const item = await findSingle(
        env,
        'mxapiworklog',
        `worklogid=${n}`,
        'worklogid,href'
    );

    if (!item?.href) {

        throw Object.assign(
            new Error(
                `Worklog ${id} was not found.`
            ),
            {
                status: 404
            }
        );
    }

    /*
     * Different Maximo environments can return:
     *
     * Environment A:
     *
     * https://testmaximodemo1.com/
     * maxrest/api/os/mxapiwo/
     * _QkVERk9SRC8xMzQ0/modifyworklog
     *
     *
     * Environment B:
     *
     * https://testmaximodemo2.com/
     * maxrest/api/os/mxapiwo/
     * _QkVERk9SRC8xMzQ0
     *
     *
     * getModifyWorklogUrl()
     * normalizes both formats.
     */

    const u = getModifyWorklogUrl(
        item.href
    );

    return (
        await maximoFetch(
            env,
            u,
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
        )
    ).data;
}

module.exports = async (
    req,
    res
) => {

    const b = parseBody(req.body);

    const wonum =
        String(
            req.query.wonum ||
            b.wonum ||
            ''
        ).trim();

    const siteid =
        String(
            req.query.siteid ||
            b.siteid ||
            'BEDFORD'
        ).trim();

    try {

        const env =
            await getEnvironment(
                req.query.env ||
                b.env
            );

        /*
         * GET
         *
         * Retrieve Worklogs
         */
        if (req.method === 'GET') {

            return res.json({
                data:
                    await listWorklogs(
                        env,
                        wonum,
                        siteid
                    )
            });
        }

        /*
         * Only POST is supported for
         * Create / Update operation.
         */
        if (req.method !== 'POST') {

            return res
                .status(405)
                .json({
                    error:
                        'Method not allowed'
                });
        }

        /*
         * operation = update
         *      -> Update Worklog
         *
         * otherwise
         *      -> Create Worklog
         */

        const data =
            String(
                b.operation ||
                'create'
            ).toLowerCase() === 'update'

                ? await updateWorklog(
                    env,
                    b.worklogid,
                    b
                )

                : await createWorklog(
                    env,
                    wonum,
                    siteid,
                    b
                );

        return res.json({
            message:
                'Worklog saved successfully.',
            data
        });

    } catch (e) {

        sendError(
            res,
            e,
            'Unable to process worklog.'
        );
    }
};

module.exports.listWorklogs =
    listWorklogs;

module.exports.createWorklog =
    createWorklog;

module.exports.updateWorklog =
    updateWorklog;

module.exports.getModifyWorklogUrl =
    getModifyWorklogUrl;