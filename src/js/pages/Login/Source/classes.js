
import colors from 'utils/colors';

export default theme => ({
    container: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: '8vh',
        textAlign: 'center',

        '& header, & section': {
            zIndex: 1,
        },

        '& h1': {
            fontFamily: 'HelveticaNeue-UltraLight',
            fontWeight: 'lighter',
            fontSize: 40,
            letterSpacing: 2,
            wordSpacing: 6,
            color: colors.pallet.dribbble,
        },

        '& p': {
            fontSize: 12,
            maxWidth: 320,
            lineHeight: '22px',
            color: '#000',
            wordSpacing: 2,
        },

        '&:before': {
            content: '""',
            position: 'absolute',
            left: 0,
            top: 0,
            display: 'block',
            height: '100vh',
            width: '100vw',
            background: 'rgba(255, 255, 255, .9)',
        },
    },

    section: {
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: '6vh',
    },

    card: {
        width: 200,
        margin: '0 12px',
        padding: '24px 18px',
        cursor: 'pointer',
        background: '#fff',
        border: '1px solid #eee',
        borderRadius: 4,
        transition: '.2s',

        '&:hover': {
            borderColor: colors.pallet.coral,
            boxShadow: '0 0 24px 0 rgba(0, 0, 0, .12)',
        },

        '& i': {
            display: 'block',
            fontSize: 40,
            marginBottom: 12,
            color: colors.pallet.primary,
        },

        '& h2': {
            margin: 0,
            fontSize: 16,
            fontWeight: 'normal',
            letterSpacing: 1,
            color: '#000',
        },

        '& small': {
            display: 'block',
            marginTop: 8,
            fontSize: 11,
            lineHeight: '18px',
            color: '#999',
        },
    },
});
