
import colors from 'utils/colors';

export default theme => ({
    container: {
        position: 'relative',
        minHeight: '100%',
        background: '#fff',
    },

    hero: {
        position: 'relative',
        display: 'flex',
        height: 260,
        justifyContent: 'space-between',
        alignItems: 'center',
        overflow: 'hidden',
    },

    cover: {
        position: 'relative',
        zIndex: 2,
        height: 260,
        width: 260,
    },

    summary: {
        position: 'relative',
        zIndex: 2,
        textAlign: 'right',
        paddingRight: 20,

        '& h1': {
            margin: 0,
            fontSize: 24,
            fontWeight: 'normal',
            color: '#fff',
            textShadow: '0 1px 4px rgba(0, 0, 0, .5)',
        },

        '& p': {
            margin: '8px 0 0',
            fontSize: 13,
            color: '#fff',
            textShadow: '0 1px 4px rgba(0, 0, 0, .5)',

            '& a': {
                color: '#fff',
                paddingBottom: 2,
                borderBottom: 'thin solid rgba(255, 255, 255, 0)',
                transition: '.2s',

                '&:hover': {
                    borderBottomColor: '#fff',
                },
            },
        },
    },

    background: {
        position: 'absolute',
        left: 0,
        top: 0,
        height: 260,
        width: '100%',
        zIndex: 1,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
    },

    body: {
        position: 'relative',
        zIndex: 2,
        padding: '10px 20px 40px',
    },

    list: {
        '& header': {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 0',
            fontSize: 12,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: '#999',
        },
    },

    row: {
        display: 'flex',
        alignItems: 'center',
        padding: '8px 0',
        cursor: 'pointer',
        transition: '.2s',

        '&:hover': {
            color: colors.pallet.primary,
        },

        '& aside': {
            display: 'flex',
            flex: 1,
            marginLeft: 12,
            justifyContent: 'space-between',
            alignItems: 'center',

            '& > span:nth-child(1)': {
                flex: 1,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
            },
        },

        '& .index': {
            width: 30,
            textAlign: 'center',
            fontSize: 12,
            color: '#999',
        },
    },

    time: {
        fontSize: 12,
        color: '#999',
    },

    albums: {
        display: 'flex',
        flexWrap: 'wrap',
        margin: '0 -8px',
    },

    album: {
        width: '20%',
        minWidth: 140,
        padding: '8px',
        cursor: 'pointer',

        '& figure': {
            margin: 0,
        },

        '& p': {
            margin: '8px 0 0',
            fontSize: 13,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
        },

        '& small': {
            display: 'block',
            marginTop: 2,
            fontSize: 11,
            color: '#999',
        },
    },

    empty: {
        padding: '60px 0',
        textAlign: 'center',
        color: '#999',
        fontSize: 13,
    },
});
